#!/usr/bin/env python3
"""Fluxo: um iniciador Python, a interface web e o firmware .ino. Sem pip."""
import argparse
import errno
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import secrets
import signal
import time
import shutil
import subprocess
import sys
import threading
from urllib.error import URLError
from urllib.parse import unquote, urlsplit
from urllib.request import ProxyHandler, build_opener
import webbrowser

ROOT = Path(__file__).resolve().parent


class FluxoServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != 'nt'

    def __init__(self, root=ROOT, port=8080):
        self.root = Path(root).resolve()
        self.web = self.root / 'painel'
        self.firmware = self.root / 'ControleTrafego/ControleTrafego.ino'
        self.original = self.web / 'original.ino'
        for file in (self.web / 'index.html', self.firmware, self.original):
            if not file.is_file():
                raise FileNotFoundError('Arquivo do projeto não encontrado: ' + str(file))
        self.project = hashlib.sha256(os.fsencode(self.root)).hexdigest()[:24]
        self.token = secrets.token_urlsafe(32)
        super().__init__(('127.0.0.1', port), FluxoHandler)
        self.url = 'http://127.0.0.1:%d/' % self.server_port

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return connection, address


class FluxoHandler(BaseHTTPRequestHandler):
    server_version = 'Fluxo/1.0'
    sys_version = ''

    def log_message(self, *_):
        pass

    def reply(self, code, body=b'', mime='text/plain; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.end_headers()
        if self.command != 'HEAD':
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def allowed_host(self):
        hosts = self.headers.get_all('Host', [])
        return len(hosts) == 1 and hosts[0].lower() in (
            '127.0.0.1:%d' % self.server.server_port,
            'localhost:%d' % self.server.server_port,
        )

    def do_GET(self):
        if not self.allowed_host():
            self.reply(403)
            return
        try:
            if not self.path.startswith('/') or self.path.startswith('//'):
                self.reply(400)
                return
            path = unquote(urlsplit(self.path).path, errors='strict')
            if '\x00' in path or '\\' in path:
                self.reply(400)
                return
            if any(part == '..' or part.startswith('.') for part in path.split('/') if part):
                self.reply(403)
                return
            if path == '/__fluxo/health':
                self.reply(200, json.dumps({'service': 'fluxo-python', 'project': self.server.project, 'status': 'ready'}).encode(), 'application/json')
                return
            if path == '/source-data.js':
                # Leitura direta: não há cópias geradas para sincronizar.
                sources = {'original': self.server.original.read_text(encoding='utf-8'), 'usb': self.server.firmware.read_text(encoding='utf-8')}
                runtime = {'token': self.server.token}
                script = 'window.FLUXO_SOURCES=' + json.dumps(sources, ensure_ascii=False) + ';\nwindow.FLUXO_RUNTIME=' + json.dumps(runtime) + ';\n'
                self.reply(200, script.encode(), 'text/javascript; charset=utf-8')
                return
            if path == '/firmware.ino':
                file = self.server.firmware
            else:
                file = (self.server.web / ('index.html' if path == '/' else path.lstrip('/'))).resolve()
                try:
                    file.relative_to(self.server.web.resolve())
                except ValueError:
                    self.reply(403)
                    return
            if not file.is_file():
                self.reply(404, 'Arquivo não encontrado'.encode())
                return
            mime = {'.js': 'text/javascript; charset=utf-8', '.ino': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8'}.get(file.suffix, mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
            self.reply(200, file.read_bytes(), mime)
        except (UnicodeError, ValueError):
            self.reply(400)
        except OSError:
            self.reply(500, 'Não foi possível ler o arquivo do projeto.'.encode())

    do_HEAD = do_GET

    def do_POST(self):
        origin = self.headers.get('Origin')
        valid_origin = origin is None or origin in (self.server.url.rstrip('/'), 'http://localhost:%d' % self.server.server_port)
        if not self.allowed_host() or not valid_origin or not secrets.compare_digest(self.headers.get('X-Fluxo-Token', '').encode(), self.server.token.encode()):
            self.reply(403)
            return
        if self.path == '/__fluxo/release-monitor':
            result = release_serial_monitor()
            self.reply(200, json.dumps(result, ensure_ascii=False).encode(), 'application/json; charset=utf-8')
            return
        if self.path != '/__fluxo/shutdown':
            self.reply(404)
            return
        self.reply(200, b'{"stopping":true}', 'application/json')
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def do_PUT(self):
        self.reply(405)

    do_DELETE = do_OPTIONS = do_PATCH = do_PUT



def serial_candidates():
    patterns = ('cu.usbserial*', 'cu.usbmodem*', 'cu.wchusbserial*') if sys.platform == 'darwin' else ('ttyUSB*', 'ttyACM*')
    return sorted({str(path) for pattern in patterns for path in Path('/dev').glob(pattern)})


def serial_owners(device):
    result = subprocess.run(['lsof', '-nP', '-Fpc', '--', device], capture_output=True, text=True, timeout=3)
    if result.returncode not in (0, 1):
        raise OSError('Não foi possível consultar a porta serial.')
    owners = {}
    pid = None
    for line in result.stdout.splitlines():
        if line.startswith('p') and line[1:].isdigit():
            pid = int(line[1:])
        elif line.startswith('c') and pid is not None:
            owners[pid] = line[1:]
    return owners


def monitor_executable(pid):
    if sys.platform.startswith('linux'):
        return str(Path('/proc/%d/exe' % pid).resolve(strict=True))
    result = subprocess.run(['ps', '-p', str(pid), '-o', 'comm='], capture_output=True, text=True, timeout=3)
    if result.returncode:
        raise OSError('O processo não está mais disponível.')
    return result.stdout.strip()


def release_serial_monitor():
    """Libera apenas o monitor separado da IDE na unica porta USB identificavel.

    Nunca encerra Chrome, IDE, editores ou processos recebidos por parametro HTTP.
    Com varias placas ou sem ferramentas de identificacao, pede fechamento manual.
    """
    manual = 'Feche a aba Monitor Serial/Plotter na IDE e desconecte outras abas do painel. O aplicativo não encerra o Chrome nem o editor.'
    if os.name != 'posix' or not shutil.which('lsof'):
        return {'status': 'manual', 'message': manual}
    try:
        candidates = serial_candidates()
        if len(candidates) != 1:
            return {'status': 'manual', 'message': 'Não há uma única porta USB para identificar com segurança. ' + manual}
        device = candidates[0]
        owners = serial_owners(device)
        if not owners:
            return {'status': 'free', 'message': 'A porta está livre; tentando conectar novamente.'}
        monitors = []
        for pid, name in owners.items():
            executable = monitor_executable(pid)
            if Path(executable).name not in ('serial-monitor', 'serial-monitor.exe') or 'arduino' not in executable.lower():
                return {'status': 'busy', 'message': 'A porta está em uso por ' + name + '. Se for Chrome/Edge, clique em Desconectar na outra aba ou feche essa aba. ' + manual}
            monitors.append((pid, executable))
        for pid, executable in monitors:
            # Revalida a identidade antes de terminar somente o monitor da IDE.
            if monitor_executable(pid) != executable or pid not in serial_owners(device):
                return {'status': 'manual', 'message': 'O uso da porta mudou durante a verificação. ' + manual}
        for pid, _ in monitors:
            os.kill(pid, signal.SIGTERM)
        for _ in range(10):
            if not serial_owners(device):
                return {'status': 'released', 'message': 'Monitor Serial liberado. Tentando conectar ao Arduino.'}
            time.sleep(0.1)
        return {'status': 'manual', 'message': 'O monitor ainda está usando a porta ou foi reaberto pela IDE. ' + manual}
    except (OSError, subprocess.SubprocessError) as error:
        return {'status': 'manual', 'message': 'Não foi possível liberar a porta automaticamente. ' + manual}


def open_browser(url):
    """Prefere um navegador com Web Serial, com alternativa ao padrão do sistema."""
    if sys.platform == 'darwin':
        for name in ('Google Chrome', 'Microsoft Edge'):
            for base in (Path('/Applications'), Path.home() / 'Applications'):
                if (base / (name + '.app')).is_dir():
                    try:
                        subprocess.run(['open', '-a', str(base / (name + '.app')), url], check=True)
                        return
                    except (OSError, subprocess.CalledProcessError):
                        continue
    elif os.name == 'nt':
        for env in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'):
            base = os.environ.get(env)
            if not base:
                continue
            for browser in ('Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'):
                candidate = Path(base) / browser
                if candidate.is_file():
                    subprocess.Popen([str(candidate), url])
                    return
    else:
        for name in ('google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'):
            executable = shutil.which(name)
            if executable:
                subprocess.Popen([executable, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return
    if not webbrowser.open(url):
        print('Abra este endereço no Chrome ou Edge: ' + url, flush=True)


def running_instance(port, project):
    try:
        # Não envia requisições locais por proxies configurados no sistema.
        with build_opener(ProxyHandler({})).open('http://127.0.0.1:%d/__fluxo/health' % port, timeout=0.7) as response:
            data = json.load(response)
        return data.get('service') == 'fluxo-python' and data.get('project') == project
    except (OSError, URLError, ValueError):
        return False


def main():
    parser = argparse.ArgumentParser(description='Inicia o Fluxo e abre o painel. Requer apenas Python 3.')
    parser.add_argument('--no-browser', action='store_true', help='Inicia sem abrir o navegador (para testes).')
    parser.add_argument('--port', type=int, default=8080, help='Porta preferida; 0 escolhe uma porta livre.')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('A porta deve estar entre 0 e 65535.')
    try:
        try:
            server = FluxoServer(port=args.port)
        except OSError as error:
            if error.errno != errno.EADDRINUSE or args.port == 0:
                raise
            project = hashlib.sha256(os.fsencode(ROOT)).hexdigest()[:24]
            if running_instance(args.port, project):
                url = 'http://127.0.0.1:%d/' % args.port
                print(url, flush=True)
                print('O Fluxo já está aberto. Reutilizando o painel.', flush=True)
                if not args.no_browser:
                    open_browser(url)
                return 0
            server = FluxoServer(port=0)
        with server:
            print(server.url, flush=True)
            print('Fluxo ativo. Encerre pelo botão na página ou com Ctrl+C nesta janela.', flush=True)
            if not args.no_browser:
                try:
                    open_browser(server.url)
                except OSError as error:
                    print('Não foi possível abrir o navegador: %s. Use o endereço acima.' % error, flush=True)
            try:
                server.serve_forever(poll_interval=0.1)
            except KeyboardInterrupt:
                pass
        print('Fluxo encerrado. Nenhum comando foi enviado ao Arduino.', flush=True)
        return 0
    except OSError as error:
        print('Não foi possível iniciar o Fluxo: ' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
