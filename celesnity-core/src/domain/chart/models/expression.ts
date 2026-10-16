export type BinaryOperator =
  | 'ADD'
  | 'SUBTRACT'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'EQ'
  | 'NOT_EQ'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'AND'
  | 'OR';

export type LiteralValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'NULL';

export type Expression =
  | { readonly kind: 'FIELD'; readonly relation: string; readonly field: string }
  | {
      readonly kind: 'LITERAL';
      readonly valueType: LiteralValueType;
      readonly value: string | number | boolean | null;
    }
  | {
      readonly kind: 'BINARY';
      readonly operator: BinaryOperator;
      readonly left: Expression;
      readonly right: Expression;
    }
  | {
      readonly kind: 'UNARY';
      readonly operator: 'NOT' | 'NEGATE';
      readonly operand: Expression;
    }
  | { readonly kind: 'CALL'; readonly function: string; readonly arguments: readonly Expression[] }
  | {
      readonly kind: 'CASE';
      readonly branches: readonly {
        readonly when: Expression;
        readonly then: Expression;
      }[];
      readonly otherwise: Expression;
    };
