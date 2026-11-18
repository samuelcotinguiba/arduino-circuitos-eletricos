#include <cassert>
#include <iostream>
#include "../ControleTrafego/ControleTrafego.ino"
void reset(){
  fakeMillis=0; inputs[BOTAO_A]=HIGH;inputs[BOTAO_B]=HIGH;
  estavel[0]=estavel[1]=anterior[0]=anterior[1]=HIGH;
  mudanca[0]=mudanca[1]=0;fila=viaEmergencia=viaAmarela=0;ultimaViaVerde=2;
  pausaSolicitada=conflitoBloqueado=false;tamanhoEntrada=0;descartarLinha=false;
  memset(EEPROM.data,0,sizeof EEPROM.data);Serial.output.clear();Serial.input.clear();setup();
}
void invariant(){
  assert(!(corA>0 && corB>0));
  assert(outputs[LED_A]==(corA==0));assert(outputs[LED_B]==(corB==0));
  assert(outputs[A_VERDE]==(corA==2));
  assert(outputs[B_VERDE]==(corB>0?0:255));
}
void step(){fakeMillis+=duracao;avancar();invariant();}
void cmd(const char* command){char buffer[100];strncpy(buffer,command,sizeof buffer);comando(buffer);invariant();}
int main(){
  reset();assert(estado==N_RED_TO_A);step();assert(estado==N_A_VERDE);
  step();assert(estado==N_A_AMARELO);step();assert(estado==N_RED_TO_B);
  step();assert(estado==N_B_VERDE);step();assert(estado==N_B_AMARELO);step();assert(estado==N_RED_TO_A);
  // Alterar tempos nao encurta a fase atual; validacao e atomica.
  reset();step();cmd("SET 12000 9000 2000 1000 4000 7000 3000");assert(duracao==8000 && tempos[0]==12000);
  const auto old=tempos[0];cmd("SET 1000 9000 0 1000 4000 7000 3000");assert(tempos[0]==old);
  cmd("SET 1000 9000 2000 1000 4000 7000 3000 garbage");assert(tempos[0]==old);
  cmd("SET 999999999999999999999999 9000 2000 1000 4000 7000 3000");assert(tempos[0]==old);
  cmd("SAVE");tempos[0]=1000;carregar();assert(tempos[0]==12000);
  EEPROM.data[0]=0;carregar();assert(tempos[0]==8000);
  // Um perfil novo nunca herda os ajustes salvos de outro PADRAO.
  reset();cmd("SET 12000 9000 2000 1000 4000 7000 3000");cmd("SAVE");
  Memoria m;EEPROM.get(0,m);m.base[0]=4000;EEPROM.put(0,m);carregar();assert(tempos[0]==PADRAO[0]);
  m.base[0]=PADRAO[0];m.versao=1;EEPROM.put(0,m);carregar();assert(tempos[0]==PADRAO[0]);
  // Restaurar seguido de salvar persiste a referencia, sem encurtar a fase.
  reset();step();cmd("SET 12000 9000 2000 1000 4000 7000 3000");cmd("SAVE");
  cmd("DEFAULTS");assert(duracao==8000 && !memcmp(tempos,PADRAO,sizeof tempos));cmd("SAVE");
  tempos[0]=1000;carregar();assert(!memcmp(tempos,PADRAO,sizeof tempos));
  // Emergencia original: amarelo entre atendimentos; sem amarelo extra ao terminar.
  reset();step();cmd("PRIORITY A");assert(estado==E_AMARELO);step();assert(estado==E_VERMELHO);
  cmd("PRIORITY B");assert(fila==2);step();assert(estado==E_VERDE && corA==2);
  step();assert(estado==E_AMARELO && corA==1 && viaEmergencia==2);step();assert(estado==E_VERMELHO);
  step();assert(corB==2);step();assert(estado==N_RED_TO_A && corB==0);step();assert(corA==2);
  reset();step();solicitar(1);step();step();assert(estado==E_VERDE);step();assert(estado==N_RED_TO_B);
  // Pausa atravessa amarelo; permanece indefinidamente vermelha; AUTO faz intervalo.
  reset();step();cmd("STOP");assert(estado==PARADA_AMARELO && corA==1);step();assert(estado==PAUSADO);
  fakeMillis+=100000;avancar();assert(estado==PAUSADO);cmd("PRIORITY B");assert(estado==PAUSADO);
  cmd("AUTO");assert(estado==N_RED_TO_B);step();assert(corB==2);
  // Pausa pode cancelar prioridade; comandos nao furam conflito ou parada.
  reset();solicitar(2);step();assert(estado==E_VERDE);pausar();step();assert(estado==PAUSADO);
  reset();inputs[BOTAO_A]=LOW;inputs[BOTAO_B]=LOW;botoes();fakeMillis+=21;botoes();assert(estado==CONFLITO);
  cmd("PRIORITY A");assert(estado==CONFLITO);step();assert(estado==N_RED_TO_A);botoes();assert(estado==N_RED_TO_A);
  cmd("PRIORITY A");assert(estado==N_RED_TO_A);
  inputs[BOTAO_A]=inputs[BOTAO_B]=HIGH;botoes();fakeMillis+=21;botoes();assert(!conflitoBloqueado);
  // Debounce ignora pulso curto, aceita pressao estavel.
  reset();inputs[BOTAO_A]=LOW;botoes();fakeMillis+=10;inputs[BOTAO_A]=HIGH;botoes();fakeMillis+=21;botoes();assert(estado==N_RED_TO_A);
  inputs[BOTAO_A]=LOW;botoes();fakeMillis+=21;botoes();assert(estado==E_VERMELHO);
  // Framing parcial e descarte de linha excessiva nao executam comandos truncados.
  reset();Serial.feed(std::string(120,'x')+"\nSTOP\n");while(Serial.available())serialReceber();assert(estado==PAUSADO);
  reset();Serial.feed("ST");serialReceber();assert(estado!=PAUSADO);Serial.feed("OP\r\n");serialReceber();assert(estado==PAUSADO);
  // NUL ou outros controles nao podem transformar linhas invalidas em comandos validos.
  reset();Serial.feed(std::string("STOP\0IGNORAR\n",13));while(Serial.available())serialReceber();assert(estado==N_RED_TO_A);
  Serial.feed("STOP\n");serialReceber();assert(estado==PAUSADO);
  // A subtracao de millis continua correta no rollover de 32 bits.
  reset();fakeMillis=0xFFFFFF00; mudarEstado(N_A_VERDE);step();assert(estado==N_A_AMARELO);
  // Percorre pedidos em todas as fases normais e verifica exclusao de verdes.
  for(int phase=0;phase<6;phase++)for(int lane=1;lane<=2;lane++){
    reset();mudarEstado(static_cast<Estado>(phase));solicitar(lane);
    for(int i=0;i<25;i++)step();
  }
  std::cout<<"Firmware: ciclo, prioridade, fila, amarelo, pausa, conflito, debounce, protocolo, EEPROM e rollover OK\n";
}
