declare module 'esc-pos-encoder' {
  class EscPosEncoder {
    initialize(): this;
    align(align: 'left' | 'center' | 'right'): this;
    size(width: number, height: number): this;
    line(text: string): this;
    text(text: string): this;
    newline(): this;
    cut(): this;
    encode(): Uint8Array;
  }
  export default EscgugPosEncoder;
}