"""Verificações do aplicativo Python; usa somente a biblioteca padrão."""
import http.client
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import app as fluxo


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = fluxo.FluxoServer(port=0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, kwargs={'poll_interval': 0.02}, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(2)

    def request(self, path='/', method='GET', headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        try:
            connection.request(method, path, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_page_and_assets(self):
        for path, mime in [('/', 'text/html'), ('/app.js', 'text/javascript'), ('/style.css', 'text/css'), ('/apresentacao.js', 'text/javascript'), ('/padroes.js', 'text/javascript')]:
            code, headers, body = self.request(path + '?cache=test')
            self.assertEqual(code, 200)
            self.assertIn(mime, headers['Content-Type'])
            self.assertEqual(headers['Cache-Control'], 'no-store')
            self.assertTrue(body)
        code, headers, body = self.request('/', 'HEAD')
        self.assertEqual(code, 200)
        self.assertEqual(body, b'')
        self.assertGreater(int(headers['Content-Length']), 0)

    def test_sources_and_downloads(self):
        source = self.request('/source-data.js')[2].decode()
        encoded = source.split('window.FLUXO_SOURCES=', 1)[1].split(';\nwindow.FLUXO_RUNTIME=', 1)[0]
        data = json.loads(encoded)
        self.assertEqual(data['usb'], self.server.firmware.read_text(encoding='utf-8'))
        self.assertEqual(data['original'], self.server.original.read_text(encoding='utf-8'))
        for url, file in [('/firmware.ino', self.server.firmware), ('/original.ino', self.server.original)]:
            self.assertEqual(self.request(url)[2], file.read_bytes())

    def test_errors_and_host(self):
        for path in ['/../README.md', '/%2e%2e/README.md', '/.hidden']:
            self.assertEqual(self.request(path)[0], 403)
        for path in ['/%00', '/%ff']:
            self.assertEqual(self.request(path)[0], 400)
        self.assertEqual(self.request('/missing')[0], 404)
        self.assertEqual(self.request('/', headers={'Host': 'outro-site.invalid'})[0], 403)
        self.assertEqual(self.request('/', 'PUT')[0], 405)
        self.assertEqual(self.request('/__fluxo/shutdown', 'POST')[0], 403)
        self.assertEqual(self.request('/__fluxo/shutdown', 'POST', {'X-Fluxo-Token': 'á'})[0], 403)
        self.assertEqual(self.request('/__fluxo/shutdown', 'POST', {'X-Fluxo-Token': self.server.token, 'Origin': 'https://outro.invalid'})[0], 403)
        self.assertEqual(self.request('/missing', 'POST', {'X-Fluxo-Token': self.server.token})[0], 404)

    def test_monitor_endpoint_authentication(self):
        with patch.object(fluxo, 'release_serial_monitor', return_value={'status': 'free', 'message': 'livre'}) as recovery:
            self.assertEqual(self.request('/__fluxo/release-monitor', 'POST')[0], 403)
            recovery.assert_not_called()
            code, _, body = self.request('/__fluxo/release-monitor', 'POST', {'X-Fluxo-Token': self.server.token})
            self.assertEqual(code, 200)
            self.assertEqual(json.loads(body)['status'], 'free')
            recovery.assert_called_once()

    def test_partial_request_and_health(self):
        with socket.create_connection(self.server.server_address, timeout=5) as connection:
            connection.sendall(b'GET /__flu')
            connection.sendall(('xo/health HTTP/1.1\r\nHost: 127.0.0.1:%d\r\n\r\n' % self.server.server_port).encode())
            response = connection.makefile('rb').read()
        self.assertIn(b'200 OK', response)
        data = json.loads(self.request('/__fluxo/health')[2])
        self.assertEqual(data['service'], 'fluxo-python')
        self.assertEqual(data['status'], 'ready')
        self.assertTrue(fluxo.running_instance(self.server.server_port, self.server.project))
        self.assertFalse(fluxo.running_instance(self.server.server_port, 'outro-projeto'))

    def test_reopen_and_port_conflict(self):
        command = [sys.executable, '-B', str(ROOT / 'app.py'), '--no-browser', '--port', str(self.server.server_port)]
        result = subprocess.run(command, cwd=tempfile.gettempdir(), capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Reutilizando o painel', result.stdout)
        # Se a porta pertence a outro servidor/projeto, usa outra porta sem encerrá-lo.
        with patch.object(fluxo, 'running_instance', return_value=False), patch.object(sys, 'argv', ['app.py', '--no-browser', '--port', str(self.server.server_port)]), patch.object(fluxo.FluxoServer, 'serve_forever') as serve:
            self.assertEqual(fluxo.main(), 0)
            serve.assert_called_once()

    def test_live_files_symlink_and_shutdown(self):
        with tempfile.TemporaryDirectory(prefix='fluxo-python-test-') as directory:
            root = Path(directory)
            web = root / 'painel'
            web.mkdir()
            (root / 'ControleTrafego').mkdir()
            (root / 'ControleTrafego/ControleTrafego.ino').write_text('primeiro')
            (web / 'original.ino').write_text('original')
            (web / 'index.html').write_text('página')
            outside = root / 'privado.txt'
            outside.write_text('fora da raiz web')
            (web / 'atalho.txt').symlink_to(outside)
            server = fluxo.FluxoServer(root, port=0)
            thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.02}, daemon=True)
            thread.start()
            old = self.server
            self.server = server
            try:
                self.assertEqual(self.request('/atalho.txt')[0], 403)
                server.firmware.write_text('segundo')
                self.assertEqual(self.request('/firmware.ino')[2], b'segundo')
                self.assertIn(b'segundo', self.request('/source-data.js')[2])
                self.assertEqual(self.request('/__fluxo/shutdown', 'POST', {'X-Fluxo-Token': server.token})[0], 200)
                thread.join(2)
                self.assertFalse(thread.is_alive())
            finally:
                self.server = old
                if thread.is_alive():
                    server.shutdown()
                server.server_close()


class MonitorRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.patches = [
            patch.object(fluxo.os, 'name', 'posix'),
            patch.object(fluxo.shutil, 'which', return_value='/usr/sbin/lsof'),
            patch.object(fluxo, 'serial_candidates', return_value=['/dev/cu.usbserial-test']),
            patch.object(fluxo, 'serial_owners', return_value={123: 'serial-monitor'}),
            patch.object(fluxo, 'monitor_executable', return_value='/Applications/Arduino IDE.app/tools/serial-monitor'),
            patch.object(fluxo.os, 'kill'),
        ]
        self.mocks = [item.start() for item in self.patches]
        for item in self.patches:
            self.addCleanup(item.stop)

    def test_only_identified_monitor_is_stopped(self):
        self.mocks[3].side_effect = [{123: 'serial-monitor'}, {123: 'serial-monitor'}, {}]
        self.assertEqual(fluxo.release_serial_monitor()['status'], 'released')
        self.mocks[5].assert_called_once_with(123, fluxo.signal.SIGTERM)

    def test_chrome_is_never_stopped(self):
        self.mocks[3].return_value = {123: 'Google Chrome'}
        self.mocks[4].return_value = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        result = fluxo.release_serial_monitor()
        self.assertEqual(result['status'], 'busy')
        self.assertIn('outra aba', result['message'])
        self.mocks[5].assert_not_called()

    def test_multiple_boards_are_not_touched(self):
        self.mocks[2].return_value = ['/dev/cu.usbserial-a', '/dev/cu.usbserial-b']
        self.assertEqual(fluxo.release_serial_monitor()['status'], 'manual')
        self.mocks[3].assert_not_called()
        self.mocks[5].assert_not_called()

    def test_missing_tools_are_not_worked_around(self):
        self.mocks[1].return_value = None
        self.assertEqual(fluxo.release_serial_monitor()['status'], 'manual')
        self.mocks[5].assert_not_called()

    def test_changed_process_is_not_stopped(self):
        self.mocks[4].side_effect = ['/Applications/Arduino IDE.app/tools/serial-monitor', '/Applications/Editor.app/Editor']
        self.assertEqual(fluxo.release_serial_monitor()['status'], 'manual')
        self.mocks[5].assert_not_called()

    def test_permission_denied_does_not_force_kill(self):
        self.mocks[5].side_effect = PermissionError('sem acesso')
        self.assertEqual(fluxo.release_serial_monitor()['status'], 'manual')
        self.mocks[5].assert_called_once_with(123, fluxo.signal.SIGTERM)


if __name__ == '__main__':
    unittest.main(verbosity=2)
