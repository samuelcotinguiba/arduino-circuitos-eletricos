/*
  PROJETO 4 - CONTROLE DE TRAFEGO
  Arduino Uno

  VIA A: Modulo de semaforo
  VIA B: LED RGB anodo comum

  Emergencia:
  D11 = Via A
  D12 = Via B

  Pedestres:
  D9 = Via A
  D8 = Via B
*/

// ==========================================
// PINOS
// ==========================================

const int A_VERDE = 2;
const int A_AMARELO = 4;
const int A_VERMELHO = 7;

const int B_VERMELHO = 3;
const int B_VERDE = 6;
const int B_AZUL = 5;

const int BOTAO_A = 11;
const int BOTAO_B = 12;

const int LED_A = 9;
const int LED_B = 8;

// ==========================================
// TEMPOS
// ==========================================

const unsigned long TEMPO_VERDE = 8000;
const unsigned long TEMPO_AMARELO = 3000;
const unsigned long TEMPO_SEGURANCA = 2000;

const unsigned long TEMPO_VERMELHO_EMERGENCIA = 5000;
const unsigned long TEMPO_EMERGENCIA = 10000;
const unsigned long TEMPO_CONFLITO = 5000;

const unsigned long DEBOUNCE = 20;

// ==========================================
// ESTADOS
// ==========================================

enum Estado {
  N_A_VERDE,
  N_A_AMARELO,
  N_RED_TO_B,
  N_B_VERDE,
  N_B_AMARELO,
  N_RED_TO_A,

  E_AMARELO,
  E_VERMELHO,
  E_VERDE,

  CONFLITO
};

Estado estado = N_RED_TO_A;

unsigned long instanteEstado = 0;

int viaEmergencia = 0;
int viaAmarela = 0;
int solicitacaoFila = 0;

// Guarda a ultima via que ficou verde (1 = A, 2 = B).
// Comeca em 2 para que o ciclo inicie na Via A.
int ultimaViaVerde = 2;

bool conflitoBloqueado = false;

// ==========================================
// DEBOUNCE DOS BOTOES
// ==========================================

bool estadoEstavelA = HIGH;
bool estadoEstavelB = HIGH;

bool leituraAnteriorA = HIGH;
bool leituraAnteriorB = HIGH;

unsigned long mudancaA = 0;
unsigned long mudancaB = 0;

bool pressionouA = false;
bool pressionouB = false;

// ==========================================
// CONTROLE DAS SAIDAS
// ==========================================

void desligarRGB() {
  // RGB anodo comum: 255 = apagado
  analogWrite(B_VERMELHO, 255);
  analogWrite(B_VERDE, 255);
  analogWrite(B_AZUL, 255);
}

void ambasVermelhas() {
  digitalWrite(A_VERDE, LOW);
  digitalWrite(A_AMARELO, LOW);
  digitalWrite(A_VERMELHO, HIGH);

  desligarRGB();
  analogWrite(B_VERMELHO, 0);

  // Pedestres liberados nas duas vias
  digitalWrite(LED_A, HIGH);
  digitalWrite(LED_B, HIGH);
}

void liberarA() {
  digitalWrite(A_VERDE, HIGH);
  digitalWrite(A_AMARELO, LOW);
  digitalWrite(A_VERMELHO, LOW);

  desligarRGB();
  analogWrite(B_VERMELHO, 0);

  digitalWrite(LED_A, LOW);
  digitalWrite(LED_B, HIGH);
}

void amareloA() {
  digitalWrite(A_VERDE, LOW);
  digitalWrite(A_AMARELO, HIGH);
  digitalWrite(A_VERMELHO, LOW);

  desligarRGB();
  analogWrite(B_VERMELHO, 0);

  digitalWrite(LED_A, LOW);
  digitalWrite(LED_B, HIGH);
}

void liberarB() {
  digitalWrite(A_VERDE, LOW);
  digitalWrite(A_AMARELO, LOW);
  digitalWrite(A_VERMELHO, HIGH);

  desligarRGB();
  analogWrite(B_VERDE, 0);

  digitalWrite(LED_A, HIGH);
  digitalWrite(LED_B, LOW);
}

void amareloB() {
  digitalWrite(A_VERDE, LOW);
  digitalWrite(A_AMARELO, LOW);
  digitalWrite(A_VERMELHO, HIGH);

  desligarRGB();

  // Amarelo = vermelho + verde
  analogWrite(B_VERMELHO, 0);
  analogWrite(B_VERDE, 0);

  digitalWrite(LED_A, HIGH);
  digitalWrite(LED_B, LOW);
}

// ==========================================
// MUDANCA DE ESTADO
// ==========================================

void mudarEstado(Estado novoEstado) {
  estado = novoEstado;
  instanteEstado = millis();

  switch (estado) {

    case N_A_VERDE:
      ultimaViaVerde = 1;
      liberarA();
      Serial.println("NORMAL: VIA A VERDE");
      break;

    case N_A_AMARELO:
      amareloA();
      Serial.println("NORMAL: VIA A AMARELA");
      break;

    case N_RED_TO_B:
    case N_RED_TO_A:
      ambasVermelhas();
      Serial.println("SEGURANCA: AMBAS VERMELHAS");
      break;

    case N_B_VERDE:
      ultimaViaVerde = 2;
      liberarB();
      Serial.println("NORMAL: VIA B VERDE");
      break;

    case N_B_AMARELO:
      amareloB();
      Serial.println("NORMAL: VIA B AMARELA");
      break;

    case E_AMARELO:
      if (viaAmarela == 1) {
        amareloA();
      } else {
        amareloB();
      }

      Serial.println("EMERGENCIA: TRANSICAO AMARELA");
      break;

    case E_VERMELHO:
      ambasVermelhas();
      Serial.println("EMERGENCIA: AMBAS VERMELHAS POR 5 SEGUNDOS");
      break;

    case E_VERDE:
      if (viaEmergencia == 1) {
        ultimaViaVerde = 1;
        liberarA();
        Serial.println("EMERGENCIA: VIA A LIBERADA");
      } else {
        ultimaViaVerde = 2;
        liberarB();
        Serial.println("EMERGENCIA: VIA B LIBERADA");
      }
      break;

    case CONFLITO:
      ambasVermelhas();
      Serial.println("CONFLITO: AMBAS VERMELHAS POR 5 SEGUNDOS");
      break;
  }
}

// ==========================================
// RETOMADA DO CICLO NORMAL
// ==========================================

// Passa a prioridade para a via que NAO foi a ultima a ficar verde,
// evitando que a mesma via tenha verde duas vezes seguidas.
void retomarCicloNormal() {
  if (ultimaViaVerde == 1) {
    mudarEstado(N_RED_TO_B);   // A foi a ultima, agora e a vez da B
  } else {
    mudarEstado(N_RED_TO_A);   // B foi a ultima, agora e a vez da A
  }
}

// ==========================================
// LEITURA DOS BOTOES
// ==========================================

void atualizarBotoes() {
  pressionouA = false;
  pressionouB = false;

  unsigned long agora = millis();

  bool leituraA = digitalRead(BOTAO_A);
  bool leituraB = digitalRead(BOTAO_B);

  if (leituraA != leituraAnteriorA) {
    leituraAnteriorA = leituraA;
    mudancaA = agora;
  }

  if (leituraB != leituraAnteriorB) {
    leituraAnteriorB = leituraB;
    mudancaB = agora;
  }

  if (agora - mudancaA >= DEBOUNCE &&
      leituraA != estadoEstavelA) {

    estadoEstavelA = leituraA;

    if (estadoEstavelA == LOW) {
      pressionouA = true;
    }
  }

  if (agora - mudancaB >= DEBOUNCE &&
      leituraB != estadoEstavelB) {

    estadoEstavelB = leituraB;

    if (estadoEstavelB == LOW) {
      pressionouB = true;
    }
  }
}

// ==========================================
// CONFLITO SIMULTANEO
// ==========================================

void entrarEmConflito() {
  solicitacaoFila = 0;
  conflitoBloqueado = true;

  mudarEstado(CONFLITO);
}

// ==========================================
// INICIAR EMERGENCIA
// ==========================================

void iniciarEmergencia(int via) {

  // Se ja existe emergencia em andamento,
  // a outra solicitacao vai para a fila.
  if (estado == E_AMARELO ||
      estado == E_VERMELHO ||
      estado == E_VERDE) {

    if (via != viaEmergencia) {
      solicitacaoFila = via;
      Serial.println("SEGUNDA SOLICITACAO NA FILA");
    }

    return;
  }

  viaEmergencia = via;

  // Se a Via A estiver verde, ela precisa
  // passar pelo amarelo antes do vermelho.
  if (estado == N_A_VERDE ||
      estado == N_A_AMARELO) {

    viaAmarela = 1;
    mudarEstado(E_AMARELO);
    return;
  }

  // Se a Via B estiver verde, ela precisa
  // passar pelo amarelo antes do vermelho.
  if (estado == N_B_VERDE ||
      estado == N_B_AMARELO) {

    viaAmarela = 2;
    mudarEstado(E_AMARELO);
    return;
  }

  // Se as duas vias ja estiverem vermelhas,
  // comeca imediatamente a contagem de 5 segundos.
  viaAmarela = 0;
  mudarEstado(E_VERMELHO);
}

// ==========================================
// REGISTRAR SOLICITACOES
// ==========================================

void registrarSolicitacoes() {

  if (conflitoBloqueado) {
    return;
  }

  if (pressionouA) {
    Serial.println("BOTAO DE EMERGENCIA A PRESSIONADO");
    iniciarEmergencia(1);
  }

  if (pressionouB) {
    Serial.println("BOTAO DE EMERGENCIA B PRESSIONADO");
    iniciarEmergencia(2);
  }
}

// ==========================================
// INICIALIZACAO
// ==========================================

void setup() {

  Serial.begin(9600);

  pinMode(A_VERDE, OUTPUT);
  pinMode(A_AMARELO, OUTPUT);
  pinMode(A_VERMELHO, OUTPUT);

  pinMode(B_VERDE, OUTPUT);
  pinMode(B_VERMELHO, OUTPUT);
  pinMode(B_AZUL, OUTPUT);

  pinMode(LED_A, OUTPUT);
  pinMode(LED_B, OUTPUT);

  pinMode(BOTAO_A, INPUT_PULLUP);
  pinMode(BOTAO_B, INPUT_PULLUP);

  ambasVermelhas();

  instanteEstado = millis();

  Serial.println("==============================");
  Serial.println("CONTROLE DE TRAFEGO INICIADO");
  Serial.println("==============================");
}

// ==========================================
// CICLO PRINCIPAL
// ==========================================

void loop() {

  atualizarBotoes();

  // Libera o bloqueio quando os dois botoes
  // estiverem soltos.
  if (estadoEstavelA == HIGH &&
      estadoEstavelB == HIGH) {

    conflitoBloqueado = false;
  }

  // Se os dois botoes forem pressionados,
  // ambas as vias ficam vermelhas por 5 segundos.
  if (estado != CONFLITO &&
      !conflitoBloqueado &&
      estadoEstavelA == LOW &&
      estadoEstavelB == LOW) {

    entrarEmConflito();
  }

  // TRATAMENTO DO CONFLITO
  if (estado == CONFLITO) {

    if (millis() - instanteEstado >= TEMPO_CONFLITO) {

      Serial.println("CONFLITO ENCERRADO");
      Serial.println("RETORNANDO AO CICLO NORMAL");

      retomarCicloNormal();
    }

    return;
  }

  // REGISTRO DOS BOTOES
  registrarSolicitacoes();

  if (estado == CONFLITO) {
    return;
  }

  unsigned long decorrido = millis() - instanteEstado;

  switch (estado) {

    // CICLO NORMAL

    case N_A_VERDE:
      if (decorrido >= TEMPO_VERDE) {
        mudarEstado(N_A_AMARELO);
      }
      break;

    case N_A_AMARELO:
      if (decorrido >= TEMPO_AMARELO) {
        mudarEstado(N_RED_TO_B);
      }
      break;

    case N_RED_TO_B:
      if (decorrido >= TEMPO_SEGURANCA) {
        mudarEstado(N_B_VERDE);
      }
      break;

    case N_B_VERDE:
      if (decorrido >= TEMPO_VERDE) {
        mudarEstado(N_B_AMARELO);
      }
      break;

    case N_B_AMARELO:
      if (decorrido >= TEMPO_AMARELO) {
        mudarEstado(N_RED_TO_A);
      }
      break;

    case N_RED_TO_A:
      if (decorrido >= TEMPO_SEGURANCA) {
        mudarEstado(N_A_VERDE);
      }
      break;

    // TRANSICAO DE EMERGENCIA

    case E_AMARELO:
      if (decorrido >= TEMPO_AMARELO) {
        mudarEstado(E_VERMELHO);
      }
      break;

    case E_VERMELHO:
      if (decorrido >= TEMPO_VERMELHO_EMERGENCIA) {
        mudarEstado(E_VERDE);
      }
      break;

    // ATENDIMENTO DA EMERGENCIA

    case E_VERDE:
      if (decorrido >= TEMPO_EMERGENCIA) {

        if (solicitacaoFila != 0) {

          int proximaVia = solicitacaoFila;
          solicitacaoFila = 0;

          // A via que esta verde precisa amarelar.
          viaAmarela = viaEmergencia;

          // Atualiza a proxima via de emergencia.
          viaEmergencia = proximaVia;

          mudarEstado(E_AMARELO);
        }

        else {
          Serial.println("EMERGENCIA ATENDIDA");
          Serial.println("RETORNANDO AO CICLO NORMAL");

          retomarCicloNormal();
        }
      }
      break;

    case CONFLITO:
      break;
  }
}