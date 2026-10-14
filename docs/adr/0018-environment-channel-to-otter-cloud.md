# Environments reach Otter Cloud over their own channel, not the Code relay

An environment signed in to an Otter Account keeps an offline token for it in its server secret
store (from the existing account sign-in) and holds one WebSocket to Otter Cloud's `UserHub`,
the Durable Object that already pushes Gmail changes to Mail devices. Over it the environment
receives Gmail push and short-lived provider tokens (ADR 0007), and syncs account-wide data
(ADR 0019). To Otter Cloud an environment is just another device.

We rejected extending the Linear hand-out inside `infra/relay`: it is upstream-shaped (ADR 0005)
and already carries 46 diverged files, and every addition there is rebase cost.

Consequence: this refines ADR 0007, whose "generalizing the Linear pattern" means the same trust
model (short-lived, audience-bound tokens; Otter Cloud refreshes), not the same code path.
