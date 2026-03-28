export const IAC  = 255;
export const DONT = 254;
export const DO   = 253;
export const WONT = 252;
export const WILL = 251;
export const SB   = 250;
export const SE   = 240;

const STATE_DATA = 0;
const STATE_IAC = 1;
const STATE_WILL = 2;
const STATE_WONT = 3;
const STATE_DO = 4;
const STATE_DONT = 5;
const STATE_SB = 6;
const STATE_SB_DATA = 7;
const STATE_SB_IAC = 8;

export class TelnetParser {
  constructor() {
    this.state = STATE_DATA;
    this.sbOption = 0;
    this.sbBuffer = [];
    this.onData = null;
    this.onCommand = null;
    this.onSubnegotiation = null;
  }

  feed(buffer) {
    let dataStart = -1;

    const flushData = (end) => {
      if (dataStart >= 0 && dataStart < end) {
        if (this.onData) this.onData(buffer.subarray(dataStart, end));
        dataStart = -1;
      }
    };

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];

      switch (this.state) {
        case STATE_DATA:
          if (byte === IAC) {
            flushData(i);
            this.state = STATE_IAC;
          } else if (byte === 0x0D) {
            flushData(i);
            dataStart = -1;
          } else {
            if (dataStart < 0) dataStart = i;
          }
          break;

        case STATE_IAC:
          if (byte === IAC) {
            if (this.onData) this.onData(Buffer.from([0xFF]));
            this.state = STATE_DATA;
          } else if (byte === WILL) { this.state = STATE_WILL; }
          else if (byte === WONT) { this.state = STATE_WONT; }
          else if (byte === DO) { this.state = STATE_DO; }
          else if (byte === DONT) { this.state = STATE_DONT; }
          else if (byte === SB) { this.state = STATE_SB; }
          else { this.state = STATE_DATA; }
          break;

        case STATE_WILL:
          if (this.onCommand) this.onCommand(WILL, byte);
          this.state = STATE_DATA;
          break;
        case STATE_WONT:
          if (this.onCommand) this.onCommand(WONT, byte);
          this.state = STATE_DATA;
          break;
        case STATE_DO:
          if (this.onCommand) this.onCommand(DO, byte);
          this.state = STATE_DATA;
          break;
        case STATE_DONT:
          if (this.onCommand) this.onCommand(DONT, byte);
          this.state = STATE_DATA;
          break;

        case STATE_SB:
          this.sbOption = byte;
          this.sbBuffer = [];
          this.state = STATE_SB_DATA;
          break;
        case STATE_SB_DATA:
          if (byte === IAC) { this.state = STATE_SB_IAC; }
          else { this.sbBuffer.push(byte); }
          break;
        case STATE_SB_IAC:
          if (byte === SE) {
            if (this.onSubnegotiation) this.onSubnegotiation(this.sbOption, this.sbBuffer);
            this.state = STATE_DATA;
          } else {
            this.sbBuffer.push(byte);
            this.state = STATE_SB_DATA;
          }
          break;
      }
    }

    flushData(buffer.length);
  }
}
