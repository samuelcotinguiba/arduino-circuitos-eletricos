#pragma once
#include <cstdint>
#include <string>
#include <sstream>
#include <deque>
using uint8_t=std::uint8_t;
using uint16_t=std::uint16_t;
using uint32_t=std::uint32_t;
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT_PULLUP 2
struct __FlashStringHelper {};
#define F(value) (reinterpret_cast<const __FlashStringHelper *>(value))
inline uint32_t fakeMillis=0;
inline int inputs[32]={};
inline int outputs[32]={};
inline uint32_t millis(){return fakeMillis;}
inline void pinMode(int,int){}
inline int digitalRead(int pin){return inputs[pin];}
inline void digitalWrite(int pin,int value){outputs[pin]=value;}
inline void analogWrite(int pin,int value){outputs[pin]=value;}
struct FakeSerial {
  std::string output;
  std::deque<char> input;
  void begin(int){}
  int available(){return static_cast<int>(input.size());}
  char read(){char c=input.front();input.pop_front();return c;}
  void print(const __FlashStringHelper* s){output+=reinterpret_cast<const char*>(s);}
  void print(uint8_t n){output+=std::to_string(n);}
  template<class T> void print(T value){std::ostringstream s;s<<value;output+=s.str();}
  template<class T> void println(T value){print(value);output+='\n';}
  void feed(const std::string& value){for(char c:value)input.push_back(c);}
};
inline FakeSerial Serial;
