export function isCurrentRequestToken(currentToken: number, responseToken: number): boolean {
  return currentToken === responseToken;
}
