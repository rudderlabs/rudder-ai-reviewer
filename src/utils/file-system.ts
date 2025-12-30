import type { FileSystem } from '@custom-types/file.type';
import * as fs from 'fs';
import * as path from 'path';

export class NodeFileSystem implements FileSystem {
  exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  read(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
  }

  join(...paths: string[]): string {
    return path.join(...paths);
  }
}
