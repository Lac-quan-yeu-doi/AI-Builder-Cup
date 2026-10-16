# LangChain agent-loop canary

The native React loop remains the default:

```sh
MINDER_AGENT_LOOP=react
```

Enable the LangChain canary with `MINDER_AGENT_LOOP=langchain`. It requires
`DATABASE_URL`; startup initializes LangGraph checkpoints in the isolated
`minder_langgraph` schema. The server-owned runtime session ID is the LangGraph
`thread_id`, so successor runs for one authorized session reuse the same graph
thread.

The canary is limited to autonomous runs and read-only tools. Interactive
approval, plan review, client tools, and AskUser remain on the native loop
until checkpoint-backed resume parity is verified. RuntimeStore remains the
authority for tenant authorization, run status, approvals, events, and SSE.

Rollback by setting `MINDER_AGENT_LOOP=react` and restarting the service. Do not
reuse a client-supplied checkpoint ID or grant checkpoint access from
`manifestOwner`; the existing owner authorization boundary controls access.
