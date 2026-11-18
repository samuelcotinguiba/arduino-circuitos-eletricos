'use strict';
// Exemplos simulados e acoes ao vivo explicitamente identificadas compartilham a apresentacao.
const components = {
  uno:{category:'O CÉREBRO DO PROJETO',title:'Arduino Uno',description:'Lê os botões, mede o tempo com millis() e escolhe qual estado deve ficar ativo. O programa continua rodando mesmo sem a página aberta, desde que a placa permaneça alimentada.',pins:[['Processamento','Máquina de estados'],['Saídas','Semáforos + pedestres'],['Entradas','D11 e D12 · INPUT_PULLUP']],chapter:8},
  traffic:{category:'SAÍDA DIGITAL · VIA A',title:'Módulo de semáforo',description:'Três LEDs independentes representam vermelho, amarelo e verde. HIGH acende cada saída. A lógica mantém a via B vermelha enquanto a via A está verde ou amarela.',pins:[['Verde','D2'],['Amarelo','D4'],['Vermelho','D7']],chapter:3},
  rgb:{category:'SAÍDA PWM · VIA B',title:'Um LED, várias cores.',description:'O LED RGB de ânodo comum mistura os canais vermelho e verde para produzir amarelo. Aqui, 0 acende e 255 apaga o canal. O azul permanece apagado.',pins:[['Vermelho','D3'],['Verde','D6'],['Azul','D5 · sempre apagado']],chapter:3},
  pedA:{category:'INDICAÇÃO DE PEDESTRE',title:'Pedestre da via A',description:'O LED acende quando a via A está vermelha. Ele reproduz a lógica do projeto original, inclusive nos intervalos em que ambas as vias ficam vermelhas.',pins:[['LED A','D9'],['Aceso','Via A vermelha'],['Apagado','Via A verde ou amarela']],chapter:3},
  pedB:{category:'INDICAÇÃO DE PEDESTRE',title:'Pedestre da via B',description:'O LED acende quando a via B está vermelha. Observe como a indicação muda junto com a cor do sinal, sem precisar de um temporizador independente.',pins:[['LED B','D8'],['Aceso','Via B vermelha'],['Apagado','Via B verde ou amarela']],chapter:3},
  buttonA:{category:'ENTRADA DIGITAL · PRIORIDADE',title:'Botão da via A',description:'Com INPUT_PULLUP, o pino lê HIGH em repouso. Ao pressionar o botão ligado ao GND, lê LOW. O debounce de 20 ms evita tratar oscilações do contato como vários cliques.',pins:[['Entrada A','D11 ↔ botão ↔ GND'],['Repouso','HIGH'],['Pressionado','LOW']],chapter:5},
  buttonB:{category:'ENTRADA DIGITAL · PRIORIDADE',title:'Botão da via B',description:'Solicita passagem para B. Se já houver uma emergência da outra via, o pedido entra na fila. Os dois botões pressionados juntos levam ao estado de conflito.',pins:[['Entrada B','D12 ↔ botão ↔ GND'],['Debounce','20 ms'],['Simultâneos','Conflito: ambas vermelhas']],chapter:6}
};
let selectedComponent='uno', lessonIndex=0, sourceVersion='original', chapterIndex=0, fullCode=false;
let lessonDemo=new Demo(), followCircuit=false;
function lessonModel(){return mode==='demo'?demo:lessonDemo;}
function useLessonSimulation(){followCircuit=false;return lessonModel();}
const lessons=[
 {title:'Conheça os componentes',subtitle:'Entradas, processamento e saídas',text:'O circuito tem três partes: os botões enviam pedidos, o Arduino decide o que fazer e os LEDs mostram a decisão. Clique em cada peça da bancada para descobrir seus pinos.',flow:['Botões','Arduino Uno','Semáforos e pedestres'],note:'Para apresentar: comece pela placa e mostre o caminho da informação. Os fios do desenho representam grupos de sinais.',component:'uno',chapter:0},
 {title:'O ritmo do ciclo normal',subtitle:'Uma via por vez',text:'A começa no verde, passa pelo amarelo e fecha. Depois de um intervalo com ambas vermelhas, B recebe verde. A sequência se repete, sem liberar as duas vias ao mesmo tempo.',flow:['A verde','A amarelo','Ambas vermelhas','B verde','B amarelo','Ambas vermelhas'],note:'Os tempos exibidos seguem os ajustes atuais. Use “Congelar simulação” e “Próxima fase” para explicar cada transição com calma.',component:'traffic',chapter:9},
 {title:'Como o RGB faz amarelo?',subtitle:'Dois canais, uma nova cor',text:'A via B usa um único LED RGB. Vermelho acende um canal, verde acende outro; os dois juntos formam amarelo. Como o ânodo é comum, os valores de acionamento são invertidos.',flow:['Vermelho: D3 = 0','Verde: D6 = 0','Amarelo: D3 + D6 = 0'],note:'O canal azul D5 fica em 255 (apagado). Resistores limitadores fazem parte da montagem física, embora não estejam detalhados neste diagrama.',component:'rgb',chapter:3},
 {title:'Dê passagem à prioridade',subtitle:'Transição, preparação e atendimento',text:'Um pedido de emergência inicia uma transição: amarelo, ambas vermelhas e, então, verde na via solicitada. Se a outra via pedir durante o atendimento, ela fica na fila.',flow:['Pedido de emergência','Amarelo da via ativa','Ambas vermelhas','Via prioritária'],note:'A emergência segue o original: sem fila, termina diretamente no intervalo normal; com outra emergência na fila, passa pelo amarelo antes do próximo atendimento.',component:'buttonB',chapter:7},
 {title:'E se os dois botões forem pressionados?',subtitle:'Um conflito precisa de uma resposta',text:'O programa detecta os dois botões pressionados e coloca ambas as vias em vermelho pelo tempo de conflito. Depois, retoma o ciclo. Os botões devem ser soltos para rearmar a detecção.',flow:['A + B pressionados','Conflito','Ambas vermelhas','Retorno ao ciclo'],note:'Este cenário simula a condição dos botões. Para demonstrar o debounce e os contatos elétricos, use a montagem física.',component:'buttonA',chapter:6},
 {title:'Agora, leia a lógica no .ino',subtitle:'O programa como uma história',text:'setup() prepara a placa uma vez. loop() repete a leitura dos botões e o tratamento dos estados. millis() mede o tempo sem travar o programa com delay(), permitindo continuar observando os pedidos.',flow:['setup()','Ler botões','Tratar solicitações','Atualizar estado','Repetir loop()'],note:'Abaixo você pode navegar por blocos, mostrar o arquivo completo, copiar ou baixar o código original. A versão USB aparece em uma aba separada.',component:'uno',chapter:8}
];
const originalChapters=[
 ['Pinagem','Os pinos dão nome às conexões. A via A usa três saídas digitais; B usa três canais PWM. Botões e LEDs de pedestres têm pinos separados.','// PINOS'],
 ['Tempos','As constantes guardam as durações em milissegundos. No original, o verde tem 8000 ms; na versão USB os tempos podem ser configurados pelo painel.','// TEMPOS'],
 ['Estados e memória','O enum nomeia cada etapa. As variáveis guardam a via prioritária, a fila e a última via que recebeu verde.','// ESTADOS'],
 ['Acionamento dos LEDs','Estas funções definem as saídas do circuito e dos pedestres. amareloB() combina vermelho e verde no RGB de ânodo comum.','// CONTROLE DAS SAIDAS'],
 ['Mudança e retomada','mudarEstado() registra millis() e aplica as saídas da nova fase. retomarCicloNormal() escolhe a via oposta à última que ficou verde.','// MUDANCA DE ESTADO'],
 ['Leitura e debounce','O código espera a leitura ficar estável por 20 ms antes de registrar um clique, reduzindo os efeitos da oscilação mecânica do botão.','// LEITURA DOS BOTOES'],
 ['Conflito simultâneo','Dois botões pressionados levam ao vermelho nas duas vias. O bloqueio impede repetir a detecção até os botões serem soltos.','// CONFLITO SIMULTANEO'],
 ['Pedidos de emergência','A emergência passa pelo amarelo quando necessário. Um pedido da outra via é guardado na fila para ser atendido depois.','// INICIAR EMERGENCIA'],
 ['Inicialização · setup()','Executado uma vez ao ligar: abre a Serial a 9600 baud, configura pinos e pull-ups e inicia com ambas as vias vermelhas. O original não recebe comandos do painel.','// INICIALIZACAO'],
 ['Ciclo principal · loop()','Repete a leitura e compara o tempo decorrido com a duração da fase. O switch escolhe o próximo estado normal, prioritário ou de conflito.','// CICLO PRINCIPAL']
];
const usbChapters=[
 ['Pinagem e tempos','A pinagem original é mantida. Os tempos passam a ser variáveis, com limites mínimos e máximos.','const uint8_t A_VERDE'],
 ['Estados','A versão USB inclui um estado pausado e uma transição amarela exclusiva da parada manual, além dos estados de trânsito.','enum Estado'],
 ['Persistência EEPROM','As configurações são carregadas e verificadas por versão, limites e checksum. Salvar na placa mantém os valores após desligar.','uint16_t checksum'],
 ['Saídas e transições','saidas() atualiza os LEDs. mudarEstado() captura a duração ao entrar na fase; uma mudança de configuração não encurta a fase atual.','void saidas'],
 ['Prioridade e parada','Prioridades respeitam a transição amarela. A parada cancela a fila e mantém ambas vermelhas até a retomada.','void retomar'],
 ['Botões físicos','As entradas com pull-up e debounce continuam funcionando sem o navegador. Botões simultâneos entram em conflito.','void botoes'],
 ['Avanço dos estados','O tempo decorrido determina a próxima fase. A emergência termina como no original: retorno direto ao intervalo normal sem fila; amarelo antes de atender a fila. A parada manual possui sua própria transição.','void avancar'],
 ['Telemetria e protocolo','O Uno publica JSON e valida comandos: prioridade, parada, retomada e novos tempos. Os sete valores são validados antes de aplicar.','void configuracao'],
 ['Recepção sem bloqueio','O buffer tem tamanho fixo e cada loop limita o trabalho da recepção serial para continuar atendendo o circuito.','void serialReceber'],
 ['setup() e loop()','Serial a 115200 baud. O loop lê botões, recebe comandos, avança a máquina de estados e transmite status a cada 250 ms.','void setup']
];
function svgComponent(key,content){return `<g class="circuit-component" data-component="${key}" tabindex="0" role="button" aria-label="Explorar ${components[key].title}" aria-pressed="false">${content}</g>`;}
const wire=(id,path,color,label,x,y)=>`<path class="signal-wire" id="${id}" d="${path}" stroke="${color}"/><text class="wire-label" x="${x}" y="${y}">${label}</text>`;
$('circuitDrawing').innerHTML=`<svg viewBox="0 0 1000 540" xmlns="http://www.w3.org/2000/svg" aria-label="Bancada interativa com Arduino Uno e componentes"><defs><pattern id="labGrid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#dce5d4"/></pattern><filter id="ledGlow"><feGaussianBlur stdDeviation="5"/></filter></defs><rect width="1000" height="540" fill="url(#labGrid)"/>
${wire('wireTraffic','M190 238 H270 V230 H350','#adbd91','D2 · D4 · D7',210,223)}
${wire('wireRGB','M650 230 H735 V238 H807','#c3b38b','D3 · D6 · D5',679,218)}
${wire('wirePedA','M350 330 H280 V440 H200','#adbd91','D9',235,428)}
${wire('wirePedB','M650 330 H720 V440 H803','#adbd91','D8',740,428)}
${wire('wireButtonA','M216 103 H309 V180 H350','#a9bba9','D11',264,88)}
${wire('wireButtonB','M784 103 H690 V180 H650','#a9bba9','D12',704,88)}
${svgComponent('uno',`<rect class="select-ring" x="335" y="150" width="330" height="238" rx="22"/><rect x="350" y="165" width="300" height="208" rx="15" fill="#3b8271" stroke="#2f6c5d" stroke-width="3"/><rect x="333" y="200" width="48" height="48" rx="5" fill="#cdd8ce" stroke="#a0b6a5" stroke-width="5"/><rect x="365" y="298" width="35" height="36" rx="3" fill="#233d34"/><rect x="415" y="313" width="165" height="25" rx="3" fill="#19372e"/><path d="M421 309 H575 M421 342 H575" stroke="#afc5ad" stroke-width="4" stroke-dasharray="5 6"/><path d="M399 182 H625 M411 356 H625" stroke="#1c3d31" stroke-width="10" stroke-dasharray="7 7"/><circle cx="397" cy="259" r="5" fill="#c2ed75"/><text x="457" y="253" class="uno-label">UNO</text><text x="430" y="278" class="board-subtitle">CONTROLE DE TRÁFEGO</text><text x="450" y="404" class="part-name">ARDUINO UNO</text>`)}
${svgComponent('traffic',`<rect class="select-ring" x="85" y="150" width="120" height="215" rx="20"/><rect x="107" y="163" width="78" height="172" rx="15" fill="#263c31"/><circle id="labRedA" cx="146" cy="198" r="20"/><circle id="labYellowA" cx="146" cy="249" r="20"/><circle id="labGreenA" cx="146" cy="300" r="20"/><text x="110" y="135" class="part-name">VIA A</text><text x="90" y="385" class="part-subtitle">Módulo de semáforo</text>`)}
${svgComponent('rgb',`<rect class="select-ring" x="786" y="150" width="135" height="215" rx="20"/><path d="M827 282 V330 M842 282 V343 M857 282 V330 M872 282 V330" stroke="#a7b3a2" stroke-width="5"/><path id="labRGB" d="M814 279 V234 A36 36 0 0 1 886 234 V279 Z" stroke="#cad9be" stroke-width="3"/><circle cx="839" cy="224" r="8" fill="#fff" opacity=".5"/><text x="818" y="135" class="part-name">VIA B</text><text x="800" y="385" class="part-subtitle">RGB · ânodo comum</text>`)}
${svgComponent('pedA',`<rect class="select-ring" x="108" y="411" width="110" height="106" rx="15"/><path d="M144 467 V494 M160 467 V494" stroke="#9fae98" stroke-width="4"/><path id="labPedA" d="M132 465 V447 A20 20 0 0 1 172 447 V465 Z"/><text x="103" y="528" class="part-subtitle">PEDESTRE A · D9</text>`)}
${svgComponent('pedB',`<rect class="select-ring" x="787" y="411" width="110" height="106" rx="15"/><path d="M829 467 V494 M845 467 V494" stroke="#9fae98" stroke-width="4"/><path id="labPedB" d="M817 465 V447 A20 20 0 0 1 857 447 V465 Z"/><text x="789" y="528" class="part-subtitle">PEDESTRE B · D8</text>`)}
${svgComponent('buttonA',`<rect class="select-ring" x="122" y="53" width="106" height="86" rx="14"/><rect x="137" y="68" width="76" height="59" rx="7" fill="#566653"/><circle cx="175" cy="97" r="19" fill="#a2c777" stroke="#263e2d" stroke-width="5"/><text x="111" y="40" class="part-subtitle">BOTÃO A · PRIORIDADE</text>`)}
${svgComponent('buttonB',`<rect class="select-ring" x="772" y="53" width="106" height="86" rx="14"/><rect x="787" y="68" width="76" height="59" rx="7" fill="#566653"/><circle cx="825" cy="97" r="19" fill="#a2c777" stroke="#263e2d" stroke-width="5"/><text x="762" y="40" class="part-subtitle">BOTÃO B · PRIORIDADE</text>`)}
<text x="422" y="476" class="part-subtitle">ENTRADAS → LÓGICA → SAÍDAS</text><text x="429" y="499" class="part-subtitle">GND comum na montagem</text></svg>`;
function selectComponent(key){
  selectedComponent=key;const c=components[key];$('componentCategory').textContent=c.category;$('componentTitle').textContent=c.title;$('componentDescription').textContent=c.description;
  $('componentPins').replaceChildren(...c.pins.map(([name,value])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;row.append(dt,dd);return row;}));
  $('componentLive').hidden=!['buttonA','buttonB'].includes(key);
  $('componentLive').textContent=key==='buttonA'?'Solicitar prioridade A ao vivo':'Solicitar prioridade B ao vivo';
  document.querySelectorAll('[data-component]').forEach(el=>{const active=el.dataset.component===key;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
}
document.querySelectorAll('[data-component]').forEach(el=>{el.addEventListener('click',()=>selectComponent(el.dataset.component));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectComponent(el.dataset.component);}});});
const outputPins=[['D2','A verde',s=>s.a===2?'HIGH':'LOW'],['D4','A amarelo',s=>s.a===1?'HIGH':'LOW'],['D7','A vermelho',s=>s.a===0?'HIGH':'LOW'],['D3','B vermelho',s=>s.b<2?'0':'255'],['D6','B verde',s=>s.b>0?'0':'255'],['D5','B azul',()=> '255'],['D9','Pedestre A',s=>s.a===0?'HIGH':'LOW'],['D8','Pedestre B',s=>s.b===0?'HIGH':'LOW']];
$('outputStrip').innerHTML=outputPins.map(([pin,name],i)=>`<div><strong>${pin}</strong><span>${name}</span><b id="output${i}">—</b></div>`).join('');
function renderPresentation(){
  const simulated=!followCircuit, model=lessonModel();
  const live=simulated||usable(),s=simulated?model.tick():status,colors=['#ee7966','#f1c75b','#b4ed64'];
  ['labRedA','labYellowA','labGreenA'].forEach((id,i)=>$(id).setAttribute('fill',s.a===i?colors[i]:'#495d4e'));
  $('labRGB').setAttribute('fill',colors[s.b]);$('labPedA').setAttribute('fill',s.a===0?'#b4ed64':'#92a18b');$('labPedB').setAttribute('fill',s.b===0?'#b4ed64':'#92a18b');
  $('wireTraffic').style.stroke=colors[s.a];$('wireRGB').style.stroke=colors[s.b];
  $('lessonSource').textContent=simulated?(model.paused?'Simulação congelada':'Simulação de apresentação'):live?'Circuito real · USB':'Última leitura · sem conexão';
  $('lessonPhase').textContent=live?`${names[s.state]}${s.state===11?'':' · '+Math.ceil(s.remaining/1000)+' s'}`:'Aguardando conexão';
  $('pauseLesson').disabled=false;$('stepPhase').disabled=simulated&&s.state===11;
  $('pauseLesson').textContent=simulated&&model.paused?'▶ Continuar simulação':'Ⅱ Congelar simulação';
  $('playScenario').disabled=false;$('playScenario').title='Cenários atuam apenas na apresentação. A conexão e o circuito real são mantidos.';
  $('lessonState').textContent=simulated?(model.paused?'Simulação congelada':'Simulação · não altera a placa'):live?'Acompanhando a placa':'Sem telemetria';
  $('lessonSim').setAttribute('aria-pressed',String(simulated));$('lessonLive').setAttribute('aria-pressed',String(!simulated));
  $('lessonSim').classList.toggle('selected',simulated);$('lessonLive').classList.toggle('selected',!simulated);
  $('lessonLive').disabled=mode!=='serial'||!usable();
  let activeFlow=-1;
  if(lessonIndex===1 && s.state<6)activeFlow=s.state;
  if(lessonIndex===2)activeFlow=[0,2,1][s.b];
  if(lessonIndex===3)activeFlow=({6:1,7:2,8:3,10:1})[s.state]??0;
  if(lessonIndex===4)activeFlow=s.state===9?2:3;
  document.querySelectorAll('[data-flow]').forEach(el=>el.classList.toggle('flow-current',live&&Number(el.dataset.flow)===activeFlow));
  outputPins.forEach(([, ,read],i)=>$(`output${i}`).textContent=live?read(s):'—');
  const reason=livePriorityReason();$('componentLive').disabled=!!reason;$('componentLive').title=reason;
}
function selectLesson(index){
  lessonIndex=index;const l=lessons[index];$('lessonNumber').textContent=`ETAPA ${String(index+1).padStart(2,'0')} / 06`;$('lessonTitle').textContent=l.title;$('lessonDescription').textContent=l.text;$('lessonNote').textContent=l.note;
  $('lessonFlow').replaceChildren(...l.flow.map((text,i)=>{const span=document.createElement('span');span.textContent=text;span.dataset.flow=i;return span;}));
  document.querySelectorAll('[data-lesson]').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.lesson)===index);b.setAttribute('aria-pressed',String(Number(b.dataset.lesson)===index));});
  $('lessonPrev').disabled=index===0;$('lessonNext').disabled=index===lessons.length-1;
  $('playScenario').textContent=index===5?'Explorar o código ↗':'Simular este exemplo ▶';
  selectComponent(l.component);
}
$('lessonMenu').replaceChildren(...lessons.map((l,i)=>{const b=document.createElement('button');b.dataset.lesson=i;b.innerHTML=`<span>0${i+1}</span><div><strong>${l.title}</strong><small>${l.subtitle}</small></div><b>↗</b>`;b.addEventListener('click',()=>selectLesson(i));return b;}));
$('lessonPrev').addEventListener('click',()=>selectLesson(Math.max(0,lessonIndex-1)));$('lessonNext').addEventListener('click',()=>selectLesson(Math.min(5,lessonIndex+1)));
$('lessonSim').addEventListener('click',()=>{followCircuit=false;renderPresentation();});
$('lessonLive').addEventListener('click',()=>{if(mode==='serial'&&usable()){followCircuit=true;renderPresentation();}});
$('pauseLesson').addEventListener('click',()=>{const model=useLessonSimulation();model.setPaused(!model.paused);renderPresentation();});
$('stepPhase').addEventListener('click',()=>{const model=useLessonSimulation();if(model.state===11)return;model.setPaused(true);model.since=model.now()-model.duration;renderPresentation();});
$('playScenario').addEventListener('click',()=>{
  if(lessonIndex===5){selectSource('original',8);$('codigo').scrollIntoView({behavior:'smooth'});return;}
  followCircuit=false;
  const model=new Demo();model.config=[...config];model.enter(0);
  if(mode==='demo')demo=model;else lessonDemo=model;
  if(lessonIndex===2){model.enter(4);model.setPaused(true);}
  if(lessonIndex===3)model.command('PRIORITY B');
  if(lessonIndex===4){model.queue=0;model.enter(9);}
  renderPresentation();log(`Apresentação didática: ${lessons[lessonIndex].title}`,'Demo');
});
function showChapter(index,full=false){
  chapterIndex=index;fullCode=full;const chapters=sourceVersion==='original'?originalChapters:usbChapters,source=window.FLUXO_SOURCES[sourceVersion],lines=source.split('\n'),chapter=chapters[index];
  let start=lines.findIndex(l=>l.includes(chapter[2]));if(start<0)start=0;
  let end=index<chapters.length-1?lines.findIndex((l,i)=>i>start&&l.includes(chapters[index+1][2])):lines.length;
  if(end<0)end=lines.length;
  $('chapterLabel').textContent=`BLOCO ${String(index+1).padStart(2,'0')} / ${chapters.length}`;$('chapterTitle').textContent=chapter[0];$('chapterExplanation').textContent=chapter[1];
  $('codeContent').replaceChildren(...lines.slice(full?0:start,full?lines.length:end).map((text,i)=>{const line=document.createElement('span');line.className='code-line';line.dataset.line=String((full?0:start)+i+1);const code=document.createElement('code');code.textContent=text||' ';if(text.trim().startsWith('//')||text.trim().startsWith('/*')||text.trim().startsWith('*'))code.className='comment-line';line.append(code);return line;}));
  $('codeLines').textContent=full?`${lines.length} linhas · arquivo completo`:`Linhas ${start+1}–${end} · trecho do arquivo`;
  $('showFullCode').textContent=full?'Mostrar somente este bloco ↑':'Mostrar código completo ↓';$('codeViewport').scrollTop=0;$('codeViewport').scrollLeft=0;
  document.querySelectorAll('[data-chapter]').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.chapter)===index);b.setAttribute('aria-pressed',String(Number(b.dataset.chapter)===index));});
}
function selectSource(version,index=0){
  sourceVersion=version;const chapters=version==='original'?originalChapters:usbChapters;
  $('codeChapters').replaceChildren(...chapters.map(([title],i)=>{const b=document.createElement('button');b.dataset.chapter=i;b.textContent=`${String(i+1).padStart(2,'0')}  ${title}`;b.addEventListener('click',()=>showChapter(i));return b;}));
  document.querySelectorAll('[data-source]').forEach(b=>{b.classList.toggle('selected',b.dataset.source===version);b.setAttribute('aria-pressed',String(b.dataset.source===version));});
  $('codeVersionNote').textContent=version==='original'?'ORIGINAL PRESERVADO · Este é o código enviado por você, sem alterações. Ele controla os botões e LEDs, mas não recebe comandos USB do painel.':'VERSÃO COM PAINEL · Esta é a versão para carregar no Uno e operar por USB. Acrescenta protocolo, configuração de tempos, EEPROM, parada manual. As transições da emergência original são preservadas.';
  $('downloadCode').textContent=version==='original'?'↓ Baixar original .ino':'↓ Baixar versão USB .ino';
  $('downloadCode').href=version==='original'?'original.ino':'firmware.ino';
  showChapter(index);
}
document.querySelectorAll('[data-source]').forEach(b=>b.addEventListener('click',()=>selectSource(b.dataset.source)));
$('showFullCode').addEventListener('click',()=>showChapter(chapterIndex,!fullCode));
$('componentCode').addEventListener('click',()=>selectSource('original',components[selectedComponent].chapter));
$('copyCode').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(window.FLUXO_SOURCES[sourceVersion]);toast('Código completo copiado.');}catch{toast('Não foi possível copiar automaticamente. Use o botão Baixar .ino.');}});
async function togglePresentation(force){
  const enter=force??!document.body.classList.contains('presenting');document.body.classList.toggle('presenting',enter);$('presentMode').setAttribute('aria-pressed',String(enter));$('presentMode').textContent=enter?'⛶ Sair da apresentação':'⛶ Modo apresentação';$('exitPresentation').hidden=!enter;
  if(enter){try{await document.documentElement.requestFullscreen();}catch{/* O layout de apresentacao funciona mesmo sem fullscreen. */}$('apresentacao').scrollIntoView({behavior:'instant',block:'start'});}
  else if(document.fullscreenElement)await document.exitFullscreen();
}
$('presentMode').addEventListener('click',()=>togglePresentation());$('exitPresentation').addEventListener('click',()=>togglePresentation(false));
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.body.classList.contains('presenting'))togglePresentation(false);});
document.addEventListener('keydown',e=>{if(!document.body.classList.contains('presenting'))return;if(e.key==='Escape'){togglePresentation(false);return;}if(e.target.closest('input,textarea,button,a,[tabindex]'))return;if(e.key==='ArrowRight'){e.preventDefault();selectLesson(Math.min(5,lessonIndex+1));}if(e.key==='ArrowLeft'){e.preventDefault();selectLesson(Math.max(0,lessonIndex-1));}});
function livePriorityReason(){
  if(mode!=='serial'||!usable())return 'Conecte o Arduino para solicitar prioridade na placa.';
  if(pending||restoringDefaults||liveScenarioBusy||connecting)return 'Aguarde a confirmação da operação em andamento.';
  if(status.blocked)return 'Solte os dois botões físicos para liberar novos pedidos.';
  if(status.stopping||[9,10,11].includes(status.state))return 'Conclua o conflito ou retome o ciclo antes de solicitar uma emergência.';
  return '';
}
$('componentLive').addEventListener('click',async()=>{
  const reason=livePriorityReason();if(reason){toast(reason);return;}
  const lane=selectedComponent==='buttonA'?'A':'B';
  followCircuit=true;liveScenarioBusy=true;render();
  try{
    await command('PRIORITY '+lane);
    const message='Prioridade '+lane+' confirmada pelo Arduino.';
    toast(message);log(message,'Painel');
  }catch(error){toast(error.message);log(error.message,'USB');}
  finally{liveScenarioBusy=false;render();}
});

document.addEventListener('fluxo:render',renderPresentation);
selectComponent('uno');selectLesson(0);selectSource('original');renderPresentation();
