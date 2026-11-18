/* Controle de Trafego • Arduino Uno R3 / USB
   Painel: ../painel/index.html — protocolo documentado em ../README.md
   Mantem a pinagem original. RGB da via B: anodo comum.
   Projeto didatico: LEDs de pedestres reproduzem a logica original.
*/
#include <Arduino.h>
#include <EEPROM.h>
#include <stdlib.h>
#include <string.h>

const uint8_t A_VERDE=2, A_AMARELO=4, A_VERMELHO=7;
const uint8_t B_VERMELHO=3, B_VERDE=6, B_AZUL=5;
const uint8_t BOTAO_A=11, BOTAO_B=12, LED_A=9, LED_B=8;
// PERFIL DE REFERENCIA (ms): verde A, verde B, amarelo, intervalo, preparacao, prioridade, conflito.
// Edite somente esta lista para definir um novo perfil ao carregar o sketch.
const uint16_t PADRAO[7]={8000,8000,3000,2000,5000,10000,5000};
const uint16_t MINIMO[7]={1000,1000,1000,1000,1000,1000,1000};
const uint16_t MAXIMO[7]={60000,60000,10000,10000,30000,60000,30000};
uint16_t tempos[7]; // verde A, verde B, amarelo, seguranca, vermelho emergencia, prioridade, conflito
struct Memoria { uint16_t marca; uint8_t versao; uint16_t base[7]; uint16_t valor[7]; uint16_t checksum; };

enum Estado { N_A_VERDE,N_A_AMARELO,N_RED_TO_B,N_B_VERDE,N_B_AMARELO,
              N_RED_TO_A,E_AMARELO,E_VERMELHO,E_VERDE,CONFLITO,
              PARADA_AMARELO,PAUSADO };
Estado estado=N_RED_TO_A;
uint32_t instanteEstado=0, duracao=2000, ultimaTelemetria=0;
uint8_t viaEmergencia=0, viaAmarela=0, fila=0, ultimaViaVerde=2;
bool pausaSolicitada=false, conflitoBloqueado=false;
uint8_t corA=0, corB=0; // 0 vermelho, 1 amarelo, 2 verde
bool estavel[2]={HIGH,HIGH}, anterior[2]={HIGH,HIGH}, pressionou[2]={false,false};
uint32_t mudanca[2]={0,0};
char entrada[96]; uint8_t tamanhoEntrada=0; bool descartarLinha=false;

uint16_t checksum(const uint16_t *v) {
  uint16_t c=0x4A31;
  for(uint8_t i=0;i<7;i++) c=(uint16_t)((c*31U)^v[i]);
  return c;
}
void carregar() {
  memcpy(tempos,PADRAO,sizeof tempos);
  // Uma EEPROM de outro perfil ou da versao anterior nao substitui o novo padrao.
  Memoria m; EEPROM.get(0,m);
  if(m.marca!=0x5446 || m.versao!=2 || memcmp(m.base,PADRAO,sizeof PADRAO)!=0 || m.checksum!=checksum(m.valor)) return;
  for(uint8_t i=0;i<7;i++) if(m.valor[i]<MINIMO[i] || m.valor[i]>MAXIMO[i]) return;
  memcpy(tempos,m.valor,sizeof tempos);
}
void salvar() {
  Memoria m={}; m.marca=0x5446; m.versao=2;
  memcpy(m.base,PADRAO,sizeof PADRAO);
  memcpy(m.valor,tempos,sizeof tempos); m.checksum=checksum(m.valor);
  EEPROM.put(0,m); // update internamente: escreve somente bytes alterados
}
void saidas(uint8_t a,uint8_t b) {
  // Desliga verdes antes de trocar para evitar sobreposicao transitoria.
  digitalWrite(A_VERDE,LOW); digitalWrite(A_AMARELO,LOW);
  analogWrite(B_VERDE,255); analogWrite(B_VERMELHO,255); analogWrite(B_AZUL,255);
  digitalWrite(A_VERMELHO,a==0?HIGH:LOW);
  if(a==2) digitalWrite(A_VERDE,HIGH);
  if(a==1) digitalWrite(A_AMARELO,HIGH);
  if(b==0 || b==1) analogWrite(B_VERMELHO,0);
  if(b==2 || b==1) analogWrite(B_VERDE,0);
  digitalWrite(LED_A,a==0?HIGH:LOW); digitalWrite(LED_B,b==0?HIGH:LOW);
  corA=a; corB=b;
}
void evento(const __FlashStringHelper *texto) {
  Serial.print(F("{\"type\":\"event\",\"message\":\"")); Serial.print(texto); Serial.println(F("\"}"));
}
void mudarEstado(Estado novo) {
  estado=novo; instanteEstado=millis();
  switch(novo) {
    case N_A_VERDE: ultimaViaVerde=1; saidas(2,0); duracao=tempos[0]; break;
    case N_B_VERDE: ultimaViaVerde=2; saidas(0,2); duracao=tempos[1]; break;
    case N_A_AMARELO: saidas(1,0); duracao=tempos[2]; break;
    case N_B_AMARELO: saidas(0,1); duracao=tempos[2]; break;
    case E_AMARELO: case PARADA_AMARELO:
      saidas(viaAmarela==1?1:0,viaAmarela==2?1:0); duracao=tempos[2]; break;
    case E_VERDE: ultimaViaVerde=viaEmergencia;
      saidas(viaEmergencia==1?2:0,viaEmergencia==2?2:0); duracao=tempos[5]; break;
    case E_VERMELHO: saidas(0,0); duracao=tempos[4]; break;
    case CONFLITO: saidas(0,0); duracao=tempos[6]; break;
    case PAUSADO: saidas(0,0); duracao=0; break;
    default: saidas(0,0); duracao=tempos[3]; break;
  }
}
void retomar() { mudarEstado(ultimaViaVerde==1?N_RED_TO_B:N_RED_TO_A); }
bool emergencia() { return estado==E_AMARELO || estado==E_VERMELHO || estado==E_VERDE; }
void solicitar(uint8_t via) {
  if(conflitoBloqueado || pausaSolicitada || estado==PAUSADO || estado==CONFLITO || estado==PARADA_AMARELO) {
    evento(F("Prioridade indisponivel nesta fase")); return;
  }
  if(emergencia()) {
    if(via!=viaEmergencia) { fila=via; evento(F("Outra via adicionada a fila")); }
    return;
  }
  viaEmergencia=via; evento(via==1?F("Prioridade solicitada: via A"):F("Prioridade solicitada: via B"));
  if(corA!=0 || corB!=0) { viaAmarela=corA!=0?1:2; mudarEstado(E_AMARELO); }
  else { viaAmarela=0; mudarEstado(E_VERMELHO); }
}
void pausar() {
  if(pausaSolicitada || estado==PAUSADO) return;
  pausaSolicitada=true; fila=0; evento(F("Parada solicitada; concluindo transicao"));
  if(corA!=0 || corB!=0) { viaAmarela=corA!=0?1:2; mudarEstado(PARADA_AMARELO); }
  else mudarEstado(PAUSADO);
}
void botoes() {
  const uint8_t pinos[2]={BOTAO_A,BOTAO_B};
  for(uint8_t i=0;i<2;i++) {
    pressionou[i]=false; bool leitura=digitalRead(pinos[i]);
    if(leitura!=anterior[i]) { anterior[i]=leitura; mudanca[i]=millis(); }
    if(millis()-mudanca[i]>=20 && leitura!=estavel[i]) {
      estavel[i]=leitura; pressionou[i]=leitura==LOW;
    }
  }
  if(estavel[0]==HIGH && estavel[1]==HIGH) conflitoBloqueado=false;
  if(estado==PAUSADO || pausaSolicitada) return;
  if(estado!=CONFLITO && !conflitoBloqueado && estavel[0]==LOW && estavel[1]==LOW) {
    conflitoBloqueado=true; fila=0; mudarEstado(CONFLITO); evento(F("Conflito nos botoes: ambas vermelhas"));
  }
  if(conflitoBloqueado || estado==CONFLITO) return;
  if(pressionou[0]) solicitar(1);
  if(pressionou[1]) solicitar(2);
}
void avancar() {
  if(estado==PAUSADO || millis()-instanteEstado<duracao) return;
  switch(estado) {
    case N_A_VERDE: mudarEstado(N_A_AMARELO); break;
    case N_A_AMARELO: mudarEstado(N_RED_TO_B); break;
    case N_RED_TO_B: mudarEstado(N_B_VERDE); break;
    case N_B_VERDE: mudarEstado(N_B_AMARELO); break;
    case N_B_AMARELO: mudarEstado(N_RED_TO_A); break;
    case N_RED_TO_A: mudarEstado(N_A_VERDE); break;
    case E_AMARELO: mudarEstado(E_VERMELHO); break;
    case E_VERMELHO: mudarEstado(E_VERDE); break;
    // Emergencia: mesmas transicoes do codigo original.
    // Sem fila: retorna diretamente ao intervalo normal. Com fila: amarelo da via atendida.
    case E_VERDE:
      if(fila) { viaAmarela=viaEmergencia; viaEmergencia=fila; fila=0; mudarEstado(E_AMARELO); }
      else retomar();
      break;
    case PARADA_AMARELO: mudarEstado(PAUSADO); break;
    case CONFLITO: retomar(); break;
    case PAUSADO: break;
  }
}
void configuracao() {
  Serial.print(F("{\"type\":\"config\",\"values\":["));
  for(uint8_t i=0;i<7;i++) { if(i) Serial.print(','); Serial.print(tempos[i]); }
  Serial.println(F("]}"));
}
void status() {
  uint32_t decorrido=millis()-instanteEstado;
  Serial.print(F("{\"type\":\"status\",\"state\":")); Serial.print((int)estado);
  Serial.print(F(",\"a\":")); Serial.print(corA); Serial.print(F(",\"b\":")); Serial.print(corB);
  Serial.print(F(",\"remaining\":")); Serial.print(decorrido>=duracao?0:duracao-decorrido);
  Serial.print(F(",\"duration\":")); Serial.print(duracao);
  Serial.print(F(",\"queue\":")); Serial.print(fila);
  Serial.print(F(",\"priority\":")); Serial.print(viaEmergencia);
  Serial.print(F(",\"blocked\":")); Serial.print(conflitoBloqueado?1:0);
  Serial.print(F(",\"stopping\":")); Serial.print(pausaSolicitada?1:0);
  Serial.print(F(",\"uptime\":")); Serial.print(millis()); Serial.println('}');
}
void resposta(bool ok) { Serial.println(ok?F("{\"type\":\"ack\",\"ok\":true}"):F("{\"type\":\"ack\",\"ok\":false}")); }
void comando(char *linha) {
  if(!strcmp(linha,"HELLO")) { configuracao(); status(); return; }
  if(!strcmp(linha,"STATUS")) { status(); return; }
  if(!strcmp(linha,"PRIORITY A") || !strcmp(linha,"PRIORITY B")) {
    if(conflitoBloqueado || pausaSolicitada || estado==PAUSADO || estado==CONFLITO || estado==PARADA_AMARELO) { resposta(false); return; }
    solicitar(linha[9]=='A'?1:2); resposta(true); return;
  }
  if(!strcmp(linha,"STOP")) { pausar(); resposta(true); return; }
  if(!strcmp(linha,"AUTO")) {
    if(estado!=PAUSADO) { resposta(false); return; }
    pausaSolicitada=false; viaEmergencia=0; fila=0; retomar(); evento(F("Ciclo automatico retomado")); resposta(true); return;
  }
  if(!strcmp(linha,"SAVE")) { salvar(); evento(F("Tempos salvos na EEPROM")); resposta(true); return; }
  if(!strcmp(linha,"DEFAULTS")) { memcpy(tempos,PADRAO,sizeof tempos); configuracao(); resposta(true); return; }
  if(!strncmp(linha,"SET ",4)) {
    uint16_t novos[7]; char *p=linha+4;
    for(uint8_t i=0;i<7;i++) {
      if(*p<'0' || *p>'9') { resposta(false); return; }
      char *fim; unsigned long valor=strtoul(p,&fim,10);
      if(valor<MINIMO[i] || valor>MAXIMO[i] || (i<6?*fim!=' ':*fim!='\0')) { resposta(false); return; }
      novos[i]=(uint16_t)valor; p=fim+1;
    }
    memcpy(tempos,novos,sizeof tempos); configuracao(); evento(F("Tempos atualizados para as proximas fases")); resposta(true); return;
  }
  resposta(false);
}
void serialReceber() {
  // Limita o trabalho por loop: comandos nunca bloqueiam o ciclo ou botoes.
  uint8_t limite=32;
  while(Serial.available() && limite--) {
    char c=Serial.read();
    if(c=='\r') continue;
    if(c=='\n') {
      if(descartarLinha) resposta(false);
      else if(tamanhoEntrada) { entrada[tamanhoEntrada]='\0'; comando(entrada); }
      tamanhoEntrada=0; descartarLinha=false;
    } else if(!descartarLinha) {
      if(c<' ' || c>'~') { tamanhoEntrada=0; descartarLinha=true; continue; }
      if(tamanhoEntrada<sizeof(entrada)-1) entrada[tamanhoEntrada++]=c;
      else { tamanhoEntrada=0; descartarLinha=true; }
    }
  }
}
void setup() {
  Serial.begin(115200);
  const uint8_t pinos[]={A_VERDE,A_AMARELO,A_VERMELHO,B_VERMELHO,B_VERDE,B_AZUL,LED_A,LED_B};
  for(uint8_t i=0;i<sizeof pinos;i++) pinMode(pinos[i],OUTPUT);
  pinMode(BOTAO_A,INPUT_PULLUP); pinMode(BOTAO_B,INPUT_PULLUP);
  carregar(); mudarEstado(N_RED_TO_A); evento(F("Controlador iniciado")); configuracao();
}
void loop() {
  botoes(); serialReceber(); avancar();
  if(millis()-ultimaTelemetria>=250) { ultimaTelemetria=millis(); status(); }
}
