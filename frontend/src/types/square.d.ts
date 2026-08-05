export {};

declare global {
  interface Window {
    Square?: SquareWebPaymentsFactory;
  }
}

export interface SquareWebPaymentsFactory {
  payments(appId: string, locationId: string): SquarePayments;
}

export interface SquarePayments {
  card(options?: Record<string, unknown>): Promise<SquareCard>;
}

export interface SquareCard {
  attach(selector: string): Promise<void>;
  destroy(): Promise<void>;
  tokenize(): Promise<
    | { status: "OK"; token: string }
    | { status: "ERROR"; errors?: Array<{ code?: string; detail?: string }> }
  >;
}
