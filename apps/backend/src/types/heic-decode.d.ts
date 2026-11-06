// heic-decode ships without type definitions.
declare module "heic-decode" {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray }
  function decode(input: { buffer: Buffer | ArrayBuffer | Uint8Array }): Promise<Decoded>
  export default decode
}
