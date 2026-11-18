// Executa o arquivo original sem alteracoes e a versao USB com as mesmas entradas.
#include "Arduino.h"
#include "EEPROM.h"
#include <array>
#include <algorithm>
#include <cassert>
#include <iostream>
namespace Original {
#include "../painel/original.ino"
}
#include "../ControleTrafego/ControleTrafego.ino"
using Pins=std::array<int,32>;
void resetBoth(int phase){
  fakeMillis=0;std::fill(std::begin(inputs),std::end(inputs),HIGH);
  std::fill(std::begin(outputs),std::end(outputs),0);
  Original::estado=Original::N_RED_TO_A;Original::viaEmergencia=Original::viaAmarela=Original::solicitacaoFila=0;
  Original::ultimaViaVerde=2;Original::conflitoBloqueado=false;
  Original::estadoEstavelA=Original::estadoEstavelB=Original::leituraAnteriorA=Original::leituraAnteriorB=HIGH;
  Original::mudancaA=Original::mudancaB=0;Original::pressionouA=Original::pressionouB=false;
  Original::setup();Original::mudarEstado(static_cast<Original::Estado>(phase));
  estavel[0]=estavel[1]=anterior[0]=anterior[1]=HIGH;
  mudanca[0]=mudanca[1]=0;fila=viaEmergencia=viaAmarela=0;ultimaViaVerde=2;
  pausaSolicitada=conflitoBloqueado=false;tamanhoEntrada=0;descartarLinha=false;ultimaTelemetria=0;
  std::fill(std::begin(EEPROM.data),std::end(EEPROM.data),0);
  Serial.input.clear();setup();mudarEstado(static_cast<Estado>(phase));Serial.output.clear();
}
void compare(int phase,int scenario){
  resetBoth(phase);Pins oldPins,newPins;
  std::copy(std::begin(outputs),std::end(outputs),oldPins.begin());newPins=oldPins;
  uint32_t seed=1234567U+uint32_t(phase*97+scenario*19);
  for(int frame=0;frame<7200;frame++){
    fakeMillis+=25;
    const uint32_t t=fakeMillis;
    bool a=false,b=false;
    if(scenario==1)a=t>=100&&t<250;
    if(scenario==2){a=t>=100&&t<250;b=t>=700&&t<900;}
    if(scenario==3){b=(t>=100&&t<250)||(t>=1000&&t<1200);a=t>=4000&&t<4200;}
    if(scenario==4){a=b=(t>=100&&t<200)||(t>=1500&&t<1600)||(t>=5200&&t<5600);}
    if(scenario==5){
      seed=1664525U*seed+1013904223U;
      a=(seed%100)<12;b=((seed>>12)%100)<12;
    }
    inputs[BOTAO_A]=a?LOW:HIGH;inputs[BOTAO_B]=b?LOW:HIGH;
    std::copy(oldPins.begin(),oldPins.end(),std::begin(outputs));Original::loop();
    std::copy(std::begin(outputs),std::end(outputs),oldPins.begin());
    std::copy(newPins.begin(),newPins.end(),std::begin(outputs));loop();
    std::copy(std::begin(outputs),std::end(outputs),newPins.begin());
    if(static_cast<int>(estado)!=static_cast<int>(Original::estado)||oldPins!=newPins||
       viaEmergencia!=Original::viaEmergencia||viaAmarela!=Original::viaAmarela||
       fila!=Original::solicitacaoFila||ultimaViaVerde!=Original::ultimaViaVerde||
       conflitoBloqueado!=Original::conflitoBloqueado||instanteEstado!=Original::instanteEstado){
      std::cerr<<"Divergencia: fase "<<phase<<", cenario "<<scenario<<", millis "<<t
        <<", estado original "<<Original::estado<<", USB "<<estado<<"\n";std::abort();
    }
    Serial.output.clear();
  }
}
int main(){for(int phase=0;phase<6;phase++)for(int scenario=0;scenario<6;scenario++)compare(phase,scenario);
  std::cout<<"Equivalencia com o original: 36 cenarios, 259200 amostras; estados, oito saidas, fila, vias, bloqueio e instante de transicao identicos.\n";
}
