export interface FileSystem {
  exists(filePath: string): boolean;
  read(filePath: string): string;
  join(...paths: string[]): string;
}
