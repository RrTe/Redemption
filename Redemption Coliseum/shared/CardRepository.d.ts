export interface CardRepositoryCard {
  id?: string | number;
  Name?: string;
  ImageFile?: string;
  Type?: string | string[];
  Brigade?: string | string[];
  [key: string]: any;
}

export declare const LEGACY_DUALS: Record<string, [string, string]>;
export declare function splitFlipName(name: string): [string, string] | null;
export declare function isDualSided(cardOrName: any): boolean;

export declare class CardRepository {
  public static isInitialized: boolean;
  public static initialize(cardList: any[]): void;
  public static get(identifier: string | number): any | undefined;
  public static getById(id: string | number): any | undefined;
  public static getByName(name: string): any | undefined;
  public static getMany(identifiers: (string | number)[]): any[];
}
