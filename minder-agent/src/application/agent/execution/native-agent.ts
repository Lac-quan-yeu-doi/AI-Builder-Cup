/**
 * Native replacement for Pi's agent input queues.
 *
 * The controller is deliberately in-memory: Minder's runtime/session layer
 * owns durable messages and decides when it is safe to create a new turn.
 */
export class NativeAgentController {
  private readonly steering: string[] = [];
  private readonly followUps: string[] = [];

  steer(message: string): void {
    if (message.trim()) this.steering.push(message);
  }

  followUp(message: string): void {
    if (message.trim()) this.followUps.push(message);
  }

  takeSteering(): string[] {
    return this.steering.splice(0);
  }

  takeFollowUps(): string[] {
    return this.followUps.splice(0);
  }
}
