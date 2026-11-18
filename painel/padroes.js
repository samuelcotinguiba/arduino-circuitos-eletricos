'use strict';
$('baselineValues').replaceChildren(...fields.map(([label],i)=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=`${defaults[i]/1000} s`;row.append(dt,dd);return row;}));
function renderBaseline(){
  const match=config.every((v,i)=>v===defaults[i]);
  $('baselineStatus').textContent=!usable()?'Conecte para conferir os tempos':match?'Perfil de referência em uso':'Tempos atuais personalizados';
  $('restoreDefaults').disabled=!usable()||!!pending||restoringDefaults||liveScenarioBusy;
  $('restoreDefaults').textContent=restoringDefaults?'Restaurando e salvando…':'↺ Restaurar e salvar padrão';
  $('downloadSummary').textContent='Formulário: '+values().map(v=>(v/1000).toLocaleString('pt-BR')+' s').join(' / ')+'. O download não aplica esses valores na placa.';
  if(restoringDefaults){$('connect').disabled=true;$('demo').disabled=true;}
  document.querySelectorAll('#timingForm input,[data-preset]').forEach(el=>el.disabled=restoringDefaults);
}
$('restoreDefaults').addEventListener('click',async()=>{
  if(!usable()||pending||restoringDefaults||liveScenarioBusy)return;
  restoringDefaults=true;dirty=false;let applied=false;render();
  try{
    await command('SET '+defaults.join(' '));applied=true;config=[...defaults];fill(config);
    await command('SAVE');
    log(mode==='demo'?'Referência restaurada e salvamento simulado.':'Referência restaurada e gravação na EEPROM confirmada.');
    toast(mode==='demo'?'Padrão restaurado na demonstração. Nenhuma placa foi alterada.':'Padrão restaurado e salvo na placa. Novos tempos valem nas próximas fases.');
  }catch(error){toast(applied?'Padrão aplicado, mas a gravação não foi confirmada. Reconecte e salve novamente.':'Não foi possível confirmar a restauração: '+error.message);}
  finally{restoringDefaults=false;render();}
});
function buildSketch(v){
  if(v.length!==7||v.some((n,i)=>!Number.isInteger(n)||n<fields[i][1]*1000||n>fields[i][2]*1000))throw Error('Verifique os limites dos tempos no formulário.');
  const source=window.FLUXO_SOURCES.usb,pattern=/const uint16_t PADRAO\[7\]=\{[\d,]+\};/g;
  if([...source.matchAll(pattern)].length!==1)throw Error('Modelo do firmware indisponível. Recarregue a página.');
  return source.replace(pattern,`const uint16_t PADRAO[7]={${v.join(',')}};`);
}
function downloadSketch(v){
  const content=buildSketch(v),url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='ControleTrafego.ino';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('downloadBaseline').addEventListener('click',event=>{
  event.preventDefault();try{downloadSketch([...defaults]);toast('Arquivo padrão preparado para abrir na IDE Arduino.');}catch(error){toast(error.message);}
});
$('downloadCustom').addEventListener('click',()=>{
  if(!$('timingForm').reportValidity()){toast('Revise os tempos antes de baixar o arquivo.');$('tempos').scrollIntoView();return;}
  try{
    downloadSketch(values());
    toast('Arquivo preparado. Abra na IDE Arduino, compile e carregue na placa.');
    log('Arquivo .ino gerado com os tempos do formulário; envio à placa pendente.','Painel');
  }catch(error){toast(error.message);}
});
document.addEventListener('fluxo:render',renderBaseline);
document.querySelectorAll('#timingForm input').forEach(el=>el.addEventListener('input',renderBaseline));
renderBaseline();

$('quitApp').addEventListener('click',async()=>{
  if(pending||restoringDefaults||connecting||liveScenarioBusy){toast('Aguarde a operação atual terminar antes de encerrar.');return;}
  $('quitApp').disabled=true;
  try{
    const response=await fetch('/__fluxo/shutdown',{method:'POST',headers:{'X-Fluxo-Token':window.FLUXO_RUNTIME.token}});
    if(!response.ok)throw Error('Não foi possível encerrar o servidor.');
    if(port)await closePort('Aplicativo encerrado');
    document.body.classList.add('app-ended');
    const end=document.createElement('div');end.className='app-end-screen';end.setAttribute('role','status');
    const title=document.createElement('h1');title.textContent='Até o próximo sinal.';
    const message=document.createElement('p');message.textContent='O aplicativo foi encerrado. Você pode fechar esta aba. Para abrir novamente, use o iniciador do Fluxo.';
    const detail=document.createElement('p');detail.textContent='Nenhum comando de parada foi enviado ao Arduino. Se a placa continuar alimentada, ela segue seu programa.';
    end.append(title,message,detail);document.body.append(end);
  }catch(error){toast(error.message);$('quitApp').disabled=false;}
});
