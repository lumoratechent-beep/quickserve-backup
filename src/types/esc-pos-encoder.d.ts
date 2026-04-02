declare module 'esc-pos-encoder' {
  class EscPosEncoder {
    initialize(): this;
    align(align: 'left' | 'center' | 'right'): this;
    size(width: number, height: number): this;
    width(width: number): this;
    height(height: number): this;
    line(text: string): this;
    text(text: string): this;
    newline(): this;
    bold(on?: boolean): this;
    italic(on?: boolean): this;
    underline(on?: boolean): this;
    invert(on?: boolean): this;
    font(font: 'A' | 'B'): this;
    cut(mode?: 'full' | 'partial'): this;
    raw(data: number[]): this;
    codepage(codepage: string): this;
    barcode(content: string, type: string, height?: number): this;
    qrcode(content: string, model?: number, size?: number, errorLevel?: string): this;
    pdf417(content: string, width?: number, height?: number, columns?: number, ec?: number): this;
    image(image: any, width: number, height: number, algorithm?: string): this;
    pulse(device?: number, onTime?: number, offTime?: number): this;
    rule(options?: { style?: string; width?: number }): this;
    box(options: { width: number; style?: string; marginLeft?: number }, callback: (encoder: EscPosEncoder) => EscPosEncoder): this;
    table(columns: Array<{ width: number; align?: string; marginRight?: number }>, rows: string[][]): this;
    encode(): Uint8Array;
  }
  export default EscPosEncoder;
}