# Fluxo · Arduino Uno + Python

Aplicação local em Python para abrir o painel, demonstrar o circuito e controlar o Uno por USB. **Sem pip, Swift, compilação do aplicativo ou Node para usar.**

## Abrir

**`app.py` é o ponto de entrada único:** inicia o servidor, escolhe a porta e abre o navegador automaticamente. Dê dois cliques nele se os arquivos `.py` estiverem associados à execução pelo Python. Se o sistema abrir um editor, use os atalhos abaixo ou configure essa associação; o arquivo não altera as preferências do sistema.

Requer **Python 3.9 ou superior** e **Chrome ou Edge** para conectar por USB.

- **macOS:** dê dois cliques em `iniciar-painel.command`.
- **Windows:** dê dois cliques em `iniciar-painel.bat`.
- **Linux ou terminal:** execute `python3 app.py` (`python app.py` no Windows).

O iniciador prepara o servidor e abre o navegador. Prefere a porta 8080; se ela pertence a outra aplicação, escolhe uma porta livre. Se este projeto já estiver aberto na porta 8080, reutiliza o serviço existente. O endereço aparece na janela do iniciador.

Para encerrar, use **Encerrar aplicativo** no topo da página ou `Ctrl+C` na janela do iniciador. Isso não envia comandos de parada ao Arduino. Fechar apenas a aba não encerra o servidor. O serviço fica acessível somente no próprio computador, em `127.0.0.1`.

A versão Python foi validada no macOS. Os iniciadores e a seleção do navegador também contemplam Windows e Linux, sem dependências específicas de macOS. Python deve estar instalado antes de abrir; o aplicativo não instala ferramentas automaticamente.

## Conectar a placa

1. Abra `ControleTrafego/ControleTrafego.ino` na IDE Arduino.
2. Selecione **Arduino Uno** e a porta USB. Compile e carregue.
3. Feche o Monitor Serial e o Plotter Serial para liberar a porta.
4. Abra o Fluxo e clique em **Conectar Arduino**. Selecione a porta e espere a sincronização.

Se a placa já estiver com esse firmware, não precisa carregá-lo novamente para usar o iniciador Python. O navegador exige a seleção da porta por ação do usuário. A abertura da USB costuma reiniciar o Uno. A simulação e a apresentação funcionam sem placa; o controle físico requer USB e Chrome/Edge no computador.

## Uno compatível / CH340: a porta aparece, mas não conecta

Uma placa compatível pode aparecer como **USB Serial**, **CH340** ou **Unknown**, sem o nome Arduino. O encapsulamento soldado do microcontrolador não muda o protocolo exigido pelo painel. Se a porta aparece, selecione-a e, na IDE Arduino, escolha **Arduino Uno** manualmente.

No computador desta sessão foi encontrada `/dev/cu.usbserial-1130`, USB `1A86:7523` (CH340). Antes da correção, o teste de comunicação recebeu a 9600 baud mensagens como `NORMAL: VIA A AMARELA` e `NORMAL: VIA B VERDE`, indicando o código original em execução. Com autorização do usuário, a versão USB foi gravada nessa placa e a comunicação a 115200 baud foi confirmada com configuração padrão e 14 mensagens de estado válidas. O painel usa a versão USB a 115200 baud, com JSON e recepção de comandos. Mudar apenas a velocidade do navegador não adiciona esses comandos ao código original.

Carregue **`ControleTrafego/ControleTrafego.ino` da raiz do projeto**, ou baixe a **Versão com painel USB** no site. O arquivo `painel/original.ino` existe para consulta/apresentação e não implementa o controle web. A emergência original é preservada na versão USB e verificada pelo teste de equivalência. Feche o Monitor/Plotter Serial e outras abas conectadas antes de usar o painel.

Referência: [Arduino: dispositivos Unknown e conversores CH340](https://support.arduino.cc/hc/en-us/articles/16884223752220-If-there-are-Unknown-devices-in-the-board-selector-or-ports-without-a-board-name-in-the-Tools-Port-menu).

## Porta ocupada e Monitor Serial

Ao conectar, uma aba nova do Fluxo pede à aba anterior, na mesma origem (mesmo endereço e porta), que libere sua própria conexão USB. Isso só acontece quando há uma única placa autorizada com aquela identificação USB e nenhuma operação pendente. Abas antigas, que ainda não carregaram esta atualização, precisam ser recarregadas ou desconectadas manualmente. Placas iguais múltiplas e abas em endereços diferentes não são transferidas automaticamente.

Se abrir a USB falhar, o navegador pede ajuda ao Python. No macOS/Linux, com `lsof` disponível e uma única porta USB candidata, o aplicativo pode encerrar somente o processo separado `serial-monitor` da instalação Arduino que estiver ocupando essa porta. A identificação é conferida novamente antes do encerramento. A tentativa de conexão é repetida uma vez.

**O Chrome e o editor Arduino nunca são encerrados pelo aplicativo.** Se outra aba do Chrome ocupa a porta, desconecte nela ou feche essa aba. Se não houver identificação segura do monitor, se houver várias placas, se a IDE reabrir o monitor ou se a plataforma não oferecer essa identificação (incluindo Windows), o painel explica como fechar a aba Monitor Serial/Plotter manualmente. O Chrome não tem permissão para fechar diretamente programas do computador; essa assistência depende do `app.py` atualizado e ativo.

A recuperação é solicitada somente após falha ao abrir a porta escolhida e protegida pelo token da sessão local. Ela não grava firmware nem envia comandos de prioridade ou parada. Depois de atualizar `app.py`, reinicie o servidor para carregar esse recurso.

Referências: [Arduino: localizar processos que bloqueiam a porta](https://support.arduino.cc/hc/en-us/articles/4407830972050-Find-and-stop-process-blocking-a-port), [Web Serial no Chrome](https://developer.chrome.com/docs/capabilities/serial/).

## O que fica em cada pasta

```text
app.py                          servidor e abertura do navegador
iniciar-painel.command             atalho para macOS
iniciar-painel.bat                 atalho para Windows
ControleTrafego/ControleTrafego.ino firmware para a placa
painel/                           interface, original preservado e relatório
tests/                           testes Python, navegador e lógica do firmware
```

Fotos de referência e capturas locais não são necessárias para executar o projeto e ficam fora do versionamento. O `.gitignore` também exclui caches, ambientes virtuais, configurações locais e arquivos gerados de compilação e testes.

**Não é necessário gerar ou sincronizar arquivos.** O Python lê o `.ino` atual diretamente para alimentar a consulta de código e o download. `source-data.js` e `firmware.ino` são endereços servidos pela aplicação, não cópias em disco. O original enviado está preservado em `painel/original.ino`.

Depois de editar HTML/CSS/JS ou o `.ino`, recarregue a página. Mudanças no Python pedem reiniciar o iniciador. Mudanças no programa executado pela placa exigem novo upload pela IDE; editar os tempos pelo painel não exige recompilar. Abra a interface pelo iniciador, e não diretamente pelo arquivo HTML.

## Controles, padrões e apresentação

O painel mostra LEDs, pedestres, estado, tempo restante, prioridades e fila. Permite configurar sete tempos, aplicar na RAM, salvar na EEPROM e restaurar o padrão original. Os novos tempos valem na próxima entrada da fase, preservando a duração da fase em andamento.

| Ajuste | Padrão | Limites |
| --- | --- | --- |
| Verde A | 8 s | 1–60 s |
| Verde B | 8 s | 1–60 s |
| Amarelo | 3 s | 1–10 s |
| Intervalo normal | 2 s | 1–10 s |
| Preparação da emergência | 5 s | 1–30 s |
| Verde de emergência | 10 s | 1–60 s |
| Conflito | 5 s | 1–30 s |

O ciclo padrão tem 26 s. **Restaurar e salvar padrão** aplica os sete valores originais e grava na EEPROM. **Baixar .ino padrão** e **.ino com tempos do formulário** preparam arquivos para carregar pela IDE; não gravam a placa automaticamente.

A EEPROM guarda a configuração e a lista-base do perfil compilado. Ao carregar outro perfil, ajustes salvos para uma base diferente são ignorados. Recarregar o mesmo perfil mantém seus ajustes salvos. A primeira carga do formato de EEPROM 2 ignora dados da versão 1. O botão de restauração sempre aplica o padrão original do projeto; o comando serial `DEFAULTS` restaura a base compilada no firmware carregado.

Em **Circuito interativo**, clique nos componentes para ver funções e pinos. O modo apresentação tem seis etapas, cenários, congelamento e avanço por fase. Os controles da apresentação permanecem disponíveis com a placa conectada: a simulação didática pode ser congelada, avançada ou reproduzida sem enviar comandos à placa. Use **Acompanhar Arduino** para mostrar as leituras reais e **Simular apresentação** para voltar à simulação. Ao clicar em **Simular este exemplo**, o diagrama volta à simulação e mantém a conexão USB intacta. Em **Código explicado**, consulte o original ou o firmware USB, por blocos ou por inteiro, com cópia e download.

O histórico mantém os últimos 150 eventos da sessão, exibe 40 e exporta CSV. Recarregar a página limpa o histórico. A fonte Google Fonts é opcional; sem internet são usadas fontes locais. Nenhuma função de controle depende de internet.

## Acompanhar a placa na apresentação

Use **Acompanhar Arduino** para mostrar o diagrama com os estados reais recebidos pela USB. O grupo adicional de sete botões de cenários foi removido para simplificar a apresentação. A visualização ao vivo, os exemplos simulados e os controles principais de Visão geral continuam disponíveis.

Ao selecionar o botão A ou B da ilustração, a ficha mantém a solicitação de prioridade correspondente. Essa ação aguarda a confirmação do firmware. Nenhuma mudança no `.ino` ou novo upload foi necessário.

## Emergência original preservada

- Sem fila: `E_VERDE` retorna diretamente ao intervalo normal, com ambas vermelhas, para depois liberar a via oposta à última atendida.
- Com fila: a via atendida passa por `E_AMARELO`, depois `E_VERMELHO`, antes de `E_VERDE` da próxima via.
- Pedidos repetidos da mesma via não reiniciam a emergência.
- Dois botões pressionados levam ao conflito. Enquanto já está ativo, outro acionamento não reinicia sua contagem. Os botões precisam ser soltos para rearmar a detecção.

A parada manual do painel é uma extensão explícita: fecha a via pelo amarelo e mantém ambas vermelhas até retomar. Ela cancela a fila e bloqueia prioridades enquanto ativa. Fora desse comando e dos ajustes de tempo autorizados, os testes verificam as transições originais.

Os LEDs de pedestres reproduzem o original: acendem quando sua via fica vermelha, inclusive com ambas vermelhas. O diagrama é funcional, não um esquema elétrico. O projeto é uma demonstração em bancada.

## Pinagem mantida

| Componente | Pino |
| --- | --- |
| Via A · verde / amarelo / vermelho | D2 / D4 / D7 |
| RGB de ânodo comum · vermelho / verde / azul | D3 / D6 / D5 |
| Pedestres A / B | D9 / D8 |
| Botões A / B | D11 / D12 |

Os botões são ligados ao GND com `INPUT_PULLUP`; LOW significa pressionado. Use os resistores limitadores adequados. No RGB, 0 acende e 255 apaga; amarelo combina vermelho e verde. O azul permanece apagado.

## Testar

Os testes não são dependências para usar o aplicativo. Resultados e limites estão em `painel/relatorio-testes.txt`, também disponível para download no site.

```sh
python3 -B -m unittest discover -s tests -p test_app.py -v
clang++ -std=c++17 -Wall -Wextra -Werror -fsanitize=address,undefined -I tests tests/firmware_test.cpp -o /tmp/fluxo-firmware-test
/tmp/fluxo-firmware-test
clang++ -std=c++17 -Wall -Wextra -Werror -fsanitize=address,undefined -I tests tests/original_equivalence_test.cpp -o /tmp/fluxo-original-test
/tmp/fluxo-original-test
```

A equivalência executa o original intacto e a versão USB com os tempos originais e os mesmos botões simulados: **36 cenários, 259.200 amostras**, comparando estados, oito saídas, fila, vias, bloqueio e instantes de transição. Os testes do firmware também verificam EEPROM, protocolo, restauração, debounce e rollover.

Para os testes completos no Chrome, é necessário Node apenas no ambiente de desenvolvimento:

```sh
node tests/browser_test.mjs
```

Esse teste inicia o servidor Python, verifica a interface e usa uma porta USB simulada. `CHROME_PATH` permite informar o executável do Chrome; `PYTHON` permite selecionar o interpretador. As capturas e o `.ino` gerado vão para a pasta temporária `fluxo-test-artifacts`; `FLUXO_TEST_ARTIFACTS` permite mudar esse destino, sem preencher a pasta do projeto.

Os testes automatizados não fazem upload em placa física. A gravação e a leitura serial desta placa CH340 foram realizadas separadamente, com autorização. A montagem e os LEDs/botões reais continuam pendentes de conferência. A compilação do firmware para Uno foi aprovada: 6624 bytes de flash (20%) e 451 bytes de RAM estática (22%).

Para iniciar o servidor sem navegador ou escolher a porta:

```sh
python3 app.py --no-browser --port 0
```

## Protocolo e referências

USB a **115200 baud**, comandos terminados em `\n`: `HELLO`, `STATUS`, `PRIORITY A`, `PRIORITY B`, `STOP`, `AUTO`, `SET` com sete tempos em ms, `SAVE` e `DEFAULTS`. Respostas JSON: `config`, `status`, `event` e `ack`. O painel aguarda confirmação antes de anunciar sucesso; desconexão e timeout bloqueiam comandos. Encerrar a página ou o serviço não pausa a placa se ela continuar alimentada.

- [Web Serial — Chrome](https://developer.chrome.com/docs/capabilities/serial/)
- [Arduino Uno R3 — ficha técnica](https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf)
- [EEPROM — Arduino](https://docs.arduino.cc/learn/built-in-libraries/eeprom/)
