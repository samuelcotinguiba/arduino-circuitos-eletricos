#pragma once
#include <cstring>
struct FakeEEPROM {
  unsigned char data[1024]={};
  template<class T> void get(int address,T& value){std::memcpy(&value,data+address,sizeof value);}
  template<class T> void put(int address,const T& value){std::memcpy(data+address,&value,sizeof value);}
};
inline FakeEEPROM EEPROM;
