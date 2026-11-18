'use strict';
const $ = id => document.getElementById(id);
const defaults = Object.freeze([8000,8000,3000,2000,5000,10000,5000]);
let restoringDefaults = false, liveScenarioBusy = false;
const fields = [
  ['Verde · via A',1,60,'Tempo de passagem da via A'],
  ['Verde · via B',1,60,'Tempo de passagem da via B'],
  ['Amarelo',1,10,'Transição antes de fechar a via'],
  ['Intervalo de segurança',1,10,'Ambas vermelhas entre as vias'],
  ['Preparação de prioridade',1,30,'Ambas vermelhas antes de liberar'],
  ['Passagem prioritária',1,60,'Verde durante uma emergência'],
  ['Conflito de botões',1,30,'Ambas vermelhas após conflito']
];
const names = ['Via A liberada','Via A em transição','Intervalo de segurança','Via B liberada','Via B em transição','Intervalo de segurança','Preparando prioridade','Intervalo de prioridade','Passagem prioritária','Conflito nos botões','Transição de parada','Operação pausada'];
let config = [...defaults], dirty = false, events = [], totalEvents = 0;
let mode = 'demo', port = null, reader = null, pending = null, ready = false, connecting = false;
let receivedAt = 0, haveConfig = false, haveStatus = false, lastState = -1;
let status = {state:5,a:0,b:0,remaining:2000,duration:2000,queue:0,priority:0,stopping:0,uptime:0};
let demo, pollBusy = false, toastTimer;
function usbLabel(info){
  const hex=n=>n.toString(16).toUpperCase().padStart(4,'0');
  if(info.usbVendorId===0x1A86 && info.usbProductId===0x7523)return 'USB Serial CH340 · UNO compatível';
  return info.usbVendorId?`USB ${hex(info.usbVendorId)}:${hex(info.usbProductId||0)}`:'Porta USB selecionada';
}
function serialErrorMessage(error){
  if(error.name==='NetworkError')return 'Não foi possível acessar a porta USB. Feche o Monitor/Plotter Serial e outras abas conectadas, confira o cabo e tente novamente.';
  if(error.name==='SecurityError')return 'Acesso USB bloqueado pelo navegador. Abra o painel pelo app.py no Chrome ou Edge e permita o acesso à porta.';
  return error.message;
}

function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('toast').classList.remove('show'),4500); }
function log(message, source = mode === 'demo' ? 'Demo' : 'Arduino') {
  events.unshift({time:new Date().toISOString(),message,source}); totalEvents++;
  events = events.slice(0,150); renderEvents();
}
function renderEvents() {
  $('eventList').replaceChildren(...events.slice(0,40).map(e=>{
    const row=document.createElement('li'), time=document.createElement('time'), message=document.createElement('span'), source=document.createElement('span');
    time.textContent=new Date(e.time).toLocaleTimeString('pt-BR'); time.dateTime=e.time;
    message.textContent=e.message; source.textContent=e.source; source.className='event-source';
    row.append(time,message,source); return row;
  }));
  $('eventCount').textContent=`${totalEvents} eventos nesta sessão · últimos ${events.length} disponíveis`;
}
function formatTime(ms) { const s=Math.floor(ms/1000); return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(v=>String(v).padStart(2,'0')).join(':'); }
function cycle(v) { return v[0]+v[1]+2*v[2]+2*v[3]; }
function values() { return fields.map((_,i)=>Math.round(Number($(`time${i}`).value)*1000)); }
function fill(v) { v.forEach((n,i)=>$(`time${i}`).value=n/1000); dirty=false; preview(); }
function preview() {
  const v=values(); $('previewTotal').textContent=`${(cycle(v)/1000).toLocaleString('pt-BR')} s`;
  $('timeline').replaceChildren(...[v[0],v[2],v[3],v[1],v[2],v[3]].map((n,i)=>{
    const el=document.createElement('span'); el.style.flex=String(n||1); el.title=`${['Verde A','Amarelo A','Ambas vermelhas','Verde B','Amarelo B','Ambas vermelhas'][i]}: ${n/1000} s`; return el;
  }));
  document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('selected'));
  updateControls();
}
fields.forEach(([label,min,max,hint],i)=>{
  const field=document.createElement('div'); field.className='field';
  const lbl=document.createElement('label'); lbl.htmlFor=`time${i}`; lbl.innerHTML='<i></i>'; lbl.append(label);
  const wrap=document.createElement('div'); wrap.className='number-wrap';
  const input=document.createElement('input'); Object.assign(input,{id:`time${i}`,type:'number',min:String(min),max:String(max),step:'0.1',required:true}); input.setAttribute('aria-describedby',`hint${i}`);
  input.addEventListener('input',()=>{dirty=true;preview();});
  const unit=document.createElement('span'); unit.textContent='seg'; wrap.append(input,unit);
  const small=document.createElement('small'); small.id=`hint${i}`; small.textContent=`${hint} · ${min}–${max} s`;
  field.append(lbl,wrap,small); $('timingFields').append(field);
});
function usable() { return mode==='demo' || (mode==='serial' && ready && performance.now()-receivedAt<3000); }
function updateControls() {
  const active=usable()&&!pending&&!restoringDefaults&&!liveScenarioBusy;
  document.querySelectorAll('[data-command^="PRIORITY"]').forEach(b=>b.disabled=!active || status.blocked || status.stopping || [9,10,11].includes(status.state));
  $('stop').disabled=!active || status.stopping || status.state===11;
  $('auto').disabled=!active || status.state!==11;
  $('apply').disabled=!active;
  $('save').disabled=!active || dirty;
  $('demo').disabled=connecting||liveScenarioBusy;
  $('configHint').textContent=dirty?'Há alterações no formulário. Aplique os tempos antes de salvar.':'Alterações valem a partir da próxima fase. Salve na placa para manter após desligar.';
}
function render() {
  const s=status, live=usable();
  ['A','B'].forEach((lane,i)=>{
    const color=i?s.b:s.a;
    for(const id of [`traffic${lane}`,`map${lane}`]) [...$(id).children].forEach((el,index)=>el.classList.toggle('on',color===index));
    $(`status${lane}`).textContent=['Fechada','Transição','Liberada'][color];
    $(`status${lane}`).className='lane-status '+(color===2?'green-status':color===1?'yellow-status':'');
    $(`ped${lane}`).textContent=color===0?'↟ Pedestre liberado':'↟ Pedestre aguarde';
    $(`ped${lane}`).className='pedestrian'+(color===0?'':' closed');
  });
  const badge=$('connectionBadge');
  badge.className='badge '+(mode==='serial'?(live?'connected':'offline'):'');
  badge.replaceChildren(); const dot=document.createElement('i'); badge.append(dot,mode==='demo'?'Simulação':mode==='offline'?'Desconectado':live?'Arduino conectado':'Sem telemetria');
  $('modeText').textContent=!live?'Sem conexão':s.state===11?'Pausado':s.stopping?'Parando':s.state===9?'Conflito':[6,7,8,10].includes(s.state)?'Prioridade':'Automático';
  $('modeDetail').textContent=!live?'Conecte para receber o estado':s.state===11?'Duas vias fechadas':s.stopping?'Concluindo transição segura':s.state===9?'Botões simultâneos detectados':s.state===8?`Atendendo a via ${s.priority===1?'A':'B'}`:'Controlador em execução';
  $('cycleTime').textContent=(cycle(config)/1000).toLocaleString('pt-BR');
  const remaining=live?Math.max(0,s.remaining-(performance.now()-receivedAt)):0;
  $('remaining').textContent=s.state===11||!live?'—':String(Math.ceil(remaining/1000)).padStart(2,'0');
  $('nextLabel').textContent=!live?'Aguardando dados do Arduino':s.state===11?'Aguardando retomada manual':names[s.state];
  $('phaseBadge').textContent=live?names[s.state]:'Último estado recebido';
  $('uptime').textContent=formatTime(s.uptime);
  $('sourceLabel').textContent=mode==='demo'?'Sessão de demonstração':live?'Informado pela placa':'Última leitura da placa';
  $('queueText').textContent=s.queue?`Prioridade na fila: via ${s.queue===1?'A':'B'}`:'Nenhuma prioridade na fila';
  $('syncLabel').textContent=mode==='demo'?'● Simulação local':live?'● Sincronizado via USB':'○ Leitura interrompida';
  $('clock').textContent=new Date().toLocaleTimeString('pt-BR');
  $('connect').querySelector('span').textContent=connecting?'Conectando…':port?'Desconectar':'Conectar Arduino';
  $('connect').disabled=connecting||liveScenarioBusy;
  $('demo').textContent=mode==='demo'?'↻ Reiniciar demonstração':'↻ Voltar à demonstração';
  $('notice').querySelector('p').textContent=mode==='demo'?'Você está no modo demonstração. Explore os controles com um circuito simulado. Conecte o Uno para operar os LEDs reais.':!live?'O circuito não está sincronizado. Os indicadores mostram a última leitura; os comandos estão desabilitados. O Arduino continua executando seu programa.':'Conexão USB ativa. Os indicadores refletem a telemetria do Arduino. Fechar a página não interrompe o ciclo da placa.';
  $('notice').querySelector('.notice-tag').textContent=mode==='demo'?'SEM HARDWARE':live?'CONTROLE LOCAL':'SEM TELEMETRIA';
  updateControls();
  document.dispatchEvent(new Event('fluxo:render'));
}
class Demo {
  constructor() { this.config=[...defaults]; this.saved=[...defaults]; this.state=5; this.last=2; this.priority=0; this.queue=0; this.yellow=0; this.stopping=false; this.boot=this.now(); this.enter(5); }
  now(){return this.paused?this.pausedAt:performance.now();}
  setPaused(value){
    if(value===!!this.paused)return;
    if(value){this.pausedAt=performance.now();this.paused=true;}
    else{const elapsed=performance.now()-this.pausedAt;this.since+=elapsed;this.boot+=elapsed;this.paused=false;}
  }
  enter(state) {
    this.state=state; this.since=this.now(); this.a=0; this.b=0;
    this.duration=this.config[3];
    if(state===0){this.a=2;this.last=1;this.duration=this.config[0];}
    if(state===3){this.b=2;this.last=2;this.duration=this.config[1];}
    if([1,4,6,10].includes(state)){this.duration=this.config[2];if(state===1 || ([6,10].includes(state)&&this.yellow===1))this.a=1;else this.b=1;}
    if(state===7)this.duration=this.config[4];
    if(state===8){this.duration=this.config[5];this.last=this.priority;if(this.priority===1)this.a=2;else this.b=2;}
    if(state===9)this.duration=this.config[6];
    if(state===11)this.duration=0;
  }
  resume(){this.enter(this.last===1?2:5);}
  tick(){
    if(this.state!==11 && this.now()-this.since>=this.duration){
      const next={0:1,1:2,2:3,3:4,4:5,5:0,6:7,7:8};
      if(this.state===8){if(this.queue){this.yellow=this.priority;this.priority=this.queue;this.queue=0;this.enter(6);}else this.resume();}
      else if(this.state===10)this.enter(11);
      else if(this.state===9)this.resume();
      else this.enter(next[this.state]);
    }
    return {state:this.state,a:this.a,b:this.b,remaining:Math.max(0,this.duration-(this.now()-this.since)),duration:this.duration,queue:this.queue,priority:this.priority,stopping:Number(this.stopping),uptime:this.now()-this.boot};
  }
  command(cmd){
    if(cmd.startsWith('SET ')){this.config=cmd.slice(4).split(' ').map(Number);config=[...this.config];return;}
    if(cmd==='DEFAULTS'){this.config=[...defaults];config=[...defaults];return;}
    if(cmd==='SAVE'){this.saved=[...this.config];return;}
    if(cmd==='STOP'){this.stopping=true;this.queue=0;if(this.a||this.b){this.yellow=this.a?1:2;this.enter(10);}else this.enter(11);return;}
    if(cmd==='AUTO'){if(this.state!==11)throw Error('Aguarde a parada ser concluída.');this.stopping=false;this.priority=0;this.resume();return;}
    if(cmd.startsWith('PRIORITY ')){
      if(this.stopping || [9,10,11].includes(this.state))throw Error('Prioridade indisponível nesta fase.');
      const lane=cmd.endsWith('A')?1:2;
      if([6,7,8].includes(this.state)){if(lane!==this.priority)this.queue=lane;return;}
      this.priority=lane;if(this.a||this.b){this.yellow=this.a?1:2;this.enter(6);}else{this.yellow=0;this.enter(7);}
    }
  }
}
function ingest(data) {
  if(data.type==='config' && Array.isArray(data.values) && data.values.length===7 && data.values.every((v,i)=>Number.isInteger(v)&&v>=fields[i][1]*1000&&v<=fields[i][2]*1000)){
    config=[...data.values]; haveConfig=true; if(!dirty)fill(config);
  }
  if(data.type==='status' && Number.isInteger(data.state) && data.state>=0 && data.state<=11 && [0,1,2].includes(data.a) && [0,1,2].includes(data.b) && Number.isFinite(data.remaining) && Number.isFinite(data.duration) && Number.isFinite(data.uptime) && [0,1,2].includes(data.queue) && [0,1,2].includes(data.priority) && [0,1].includes(data.stopping) && !(data.a>0 && data.b>0)){
    status=data; receivedAt=performance.now(); haveStatus=true;
    if(data.state!==lastState){log(names[data.state]);lastState=data.state;}
  }
  if(data.type==='event' && typeof data.message==='string')log(data.message);
  if(data.type==='ack' && pending){const current=pending;pending=null;clearTimeout(current.timer);data.ok?current.resolve():current.reject(Error('O Arduino recusou o comando. Verifique a fase atual e os limites de tempo.'));}
  if(haveStatus&&haveConfig)ready=true;
}
async function writeLine(line) {
  if(!port?.writable)throw Error('Porta USB indisponível.');
  const writer=port.writable.getWriter();try{await writer.write(new TextEncoder().encode(line+'\n'));}finally{writer.releaseLock();}
}
async function command(cmd) {
  if(!usable())throw Error('Conecte a placa e aguarde a telemetria.');
  if(mode==='demo'){demo.command(cmd);status=demo.tick();receivedAt=performance.now();render();return;}
  if(pending)throw Error('Aguarde a resposta do comando anterior.');
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending=null;ready=false;reject(Error('Arduino não confirmou o comando. Reconecte a placa.'));closePort('Conexão encerrada após falta de confirmação');},2500);
    pending={resolve,reject,timer}; updateControls();
    writeLine(cmd).catch(error=>{if(pending){clearTimeout(pending.timer);pending=null;reject(error);closePort('Falha ao enviar comando USB');}});
  });
}
async function closePort(message='Conexão encerrada') {
  ready=false;mode='offline';haveStatus=false;haveConfig=false;
  if(pending){clearTimeout(pending.timer);pending.reject(Error('Conexão encerrada antes da confirmação.'));pending=null;}
  const oldReader=reader, oldPort=port; reader=null;port=null;
  if(oldReader)try{await oldReader.cancel();}catch{}
  if(oldPort)try{await oldPort.close();}catch{}
  $('portLabel').textContent='Não conectada';log(message,'USB');render();
}
async function readPort(activePort) {
  const localReader=activePort.readable.getReader(); reader=localReader;
  const decoder=new TextDecoder();let buffer='';
  try{
    while(true){const {value,done}=await localReader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
      let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);try{ingest(JSON.parse(line));}catch{}}
      if(buffer.length>2048)throw Error('Dados seriais inválidos.');
    }
  }catch(error){if(port===activePort)toast('Leitura USB interrompida: '+error.message);}
  finally{localReader.releaseLock();if(reader===localReader)reader=null;if(port===activePort)await closePort('Conexão USB interrompida');}
}
// Uma aba pode liberar sua propria SerialPort ao receber o pedido de outra aba do Fluxo.
const serialTabId=globalThis.crypto?.randomUUID?.()||String(Math.random());
const serialChannel='BroadcastChannel'in window?new BroadcastChannel('fluxo-serial'):null;
if(serialChannel)serialChannel.onmessage=async({data})=>{
  if(data?.type!=='release'||data.from===serialTabId||!port||pending||restoringDefaults||connecting)return;
  const info=port.getInfo();
  if(!info.usbVendorId||info.usbVendorId!==data.vendor||info.usbProductId!==data.product)return;
  const activePort=port;
  try{
    const granted=await navigator.serial.getPorts();
    // Com varias placas iguais, nao e possivel identificar a escolhida com getInfo().
    if(granted.filter(p=>{const i=p.getInfo();return i.usbVendorId===info.usbVendorId&&i.usbProductId===info.usbProductId;}).length!==1)return;
    if(port!==activePort||pending||restoringDefaults||connecting)return;
    await closePort('Conexão USB liberada para outra aba do Fluxo');
    $('connectionHelp').textContent='Outra aba do Fluxo assumiu a conexão USB. A placa continua executando seu programa.';
  }catch{/* Se a porta nao puder ser identificada, a outra aba informa o conflito. */}
};
async function releaseOtherFluxoTabs(info){
  if(!serialChannel||!info.usbVendorId)return;
  serialChannel.postMessage({type:'release',from:serialTabId,vendor:info.usbVendorId,product:info.usbProductId});
  await new Promise(resolve=>setTimeout(resolve,400));
}
async function openSerialPort(selected){
  try{await selected.open({baudRate:115200});return;}
  catch(error){
    if(error.name!=='NetworkError'||!selected.getInfo().usbVendorId)throw error;
    $('connectionHelp').textContent='A porta está ocupada. Verificando se o Monitor Serial pode ser liberado…';
    let result;
    try{
      const response=await fetch('/__fluxo/release-monitor',{method:'POST',headers:{'X-Fluxo-Token':window.FLUXO_RUNTIME.token}});
      if(!response.ok)throw Error('Reinicie o app.py para habilitar a liberação do Monitor Serial.');
      result=await response.json();
    }catch(recoveryError){throw Error(serialErrorMessage(error)+' '+recoveryError.message);}
    $('connectionHelp').textContent=result.message;log(result.message,'USB');
    if(!['free','released'].includes(result.status))throw Error(result.message);
    await new Promise(resolve=>setTimeout(resolve,300));
    try{await selected.open({baudRate:115200});}
    catch{throw Error(result.message+' A porta ainda não abriu. Feche o Monitor Serial e desconecte a outra aba antes de tentar novamente.');}
  }
}
$('connect').addEventListener('click',async()=>{
  if(port){await closePort();return;}
  if(!('serial'in navigator)){toast('Para conectar por USB, abra no Chrome ou Edge no computador. A demonstração continua disponível.');return;}
  connecting=true;$('connectionHelp').textContent='Selecione USB Serial, CH340 ou a porta do Uno. Uma placa compatível pode aparecer sem o nome Arduino.';render();let selected;
  try{
    selected=await navigator.serial.requestPort();
    await releaseOtherFluxoTabs(selected.getInfo());
    await openSerialPort(selected);
    mode='serial';port=selected;ready=false;haveConfig=false;haveStatus=false;lastState=-1;dirty=false;
    const info=port.getInfo();$('portLabel').textContent=usbLabel(info);
    log('Porta aberta. Aguardando inicialização do Uno…','USB');
    readPort(selected);
    await new Promise(resolve=>setTimeout(resolve,1800));
    if(port!==selected)throw Error('A conexão foi interrompida durante a inicialização.');
    await writeLine('HELLO');
    const start=performance.now();while(!ready && performance.now()-start<3000)await new Promise(resolve=>setTimeout(resolve,100));
    if(!ready)throw Error('A porta USB abriu, mas o firmware do painel não respondeu. Carregue a versão com painel USB (115200 baud). O original enviado usa 9600 baud e não recebe comandos da página.');
    $('connectionHelp').textContent='Placa sincronizada com o firmware USB a 115200 baud. A lógica original da emergência foi preservada.';
    toast('Arduino conectado. Circuito sincronizado.');
  }catch(error){if(error.name!=='NotFoundError'){const message=serialErrorMessage(error);$('connectionHelp').textContent=message;log(message,'USB');toast(message);if(port)await closePort('Falha ao estabelecer conexão');}}
  finally{connecting=false;render();}
});
if('serial'in navigator)navigator.serial.addEventListener('disconnect',event=>{if(event.target===port)closePort('Cabo USB desconectado');});
document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',async()=>{
  try{await command(button.dataset.command);const text=button.dataset.command==='STOP'?'Parada solicitada. Aguarde a transição.':button.dataset.command==='AUTO'?'Ciclo automático retomado.':`Prioridade ${button.dataset.command.endsWith('A')?'A':'B'} recebida.`;toast(text);log(text,mode==='demo'?'Demo':'Painel');}catch(e){toast(e.message);}finally{render();}
}));
$('timingForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!$('timingForm').reportValidity())return;
  const draft=values();try{await command('SET '+draft.join(' '));config=[...draft];fill(config);toast(mode==='demo'?'Tempos aplicados na simulação.':'Tempos confirmados pelo Arduino.');log('Novos tempos aplicados às próximas fases.');}catch(e){toast(e.message);}finally{render();}
});
$('save').addEventListener('click',async()=>{try{await command('SAVE');toast(mode==='demo'?'Salvamento simulado. Nenhuma placa foi alterada.':'Tempos salvos na EEPROM da placa.');log(mode==='demo'?'Salvamento na placa simulado.':'Persistência dos tempos confirmada.');}catch(e){toast(e.message);}finally{render();}});
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
  const presets={normal:defaults,rapido:[4000,4000,2000,1000,3000,5000,3000],longo:[20000,20000,3000,2000,5000,15000,5000]};
  if(restoringDefaults)return;fill(presets[button.dataset.preset]);dirty=true;button.classList.add('selected');updateControls();toast('Predefinição no formulário. Clique em Aplicar tempos para ativar.');
}));
$('export').addEventListener('click',()=>{
  const csv='\uFEFFHorário,Atividade,Origem\r\n'+events.map(e=>[e.time,e.message,e.source].map(value=>'"'+String(value).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='fluxo-eventos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('clearEvents').addEventListener('click',()=>{events=[];totalEvents=0;renderEvents();toast('Registro desta sessão limpo.');});
async function startDemo(){if(port)await closePort('USB encerrada para iniciar demonstração');mode='demo';demo=new Demo();config=[...defaults];fill(config);lastState=-1;ready=false;status=demo.tick();receivedAt=performance.now();log('Demonstração iniciada. Nenhum hardware está sendo controlado.','Demo');render();}
$('demo').addEventListener('click',startDemo);
document.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('nav a').forEach(n=>n.classList.remove('active'));a.classList.add('active');}));
setInterval(()=>{
  if(mode==='demo'){status=demo.tick();receivedAt=performance.now();if(status.state!==lastState){lastState=status.state;log(names[status.state],'Demo');}}
  if(mode==='serial'&&ready&&!pollBusy&&!pending&&performance.now()-receivedAt>1500){pollBusy=true;writeLine('STATUS').catch(()=>{}).finally(()=>pollBusy=false);}
  render();
},100);
startDemo();
