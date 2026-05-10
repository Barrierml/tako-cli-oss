/**
 * Mock WebSocket server for testing
 */

import type { Server, ServerWebSocket } from "bun";

export interface MockMessage {
  data: any;
  timestamp: Date;
}

export interface MockWebSocketServer {
  url: string;
  wsUrl: string;
  messages: MockMessage[];
  lastMessage: any | null;
  clients: Set<ServerWebSocket<any>>;
  close: () => void;
  broadcast: (data: any) => void;
  waitForMessage: (timeout?: number) => Promise<MockMessage>;
}

export function createMockWSServer(port?: number): MockWebSocketServer {
  const messages: MockMessage[] = [];
  const clients = new Set<ServerWebSocket<any>>();

  let messageResolvers: ((msg: MockMessage) => void)[] = [];

  const server = Bun.serve({
    port: port || 0,
    fetch(req, server) {
      const url = new URL(req.url);

      // Accept any WebSocket upgrade
      if (url.pathname.startsWith("/ws/")) {
        const upgraded = server.upgrade(req, {
          data: { path: url.pathname },
        });
        if (upgraded) {
          return undefined;
        }
      }

      return new Response("WebSocket only", { status: 400 });
    },
    websocket: {
      open(ws) {
        clients.add(ws);
      },
      message(ws, msg) {
        try {
          const data = JSON.parse(msg.toString());
          const message = { data, timestamp: new Date() };
          messages.push(message);

          // Resolve any waiting promises
          const resolver = messageResolvers.shift();
          if (resolver) {
            resolver(message);
          }
        } catch {
          // Ignore non-JSON messages
        }
      },
      close(ws) {
        clients.delete(ws);
      },
    },
  });

  const actualPort = server.port;

  return {
    url: `http://localhost:${actualPort}`,
    wsUrl: `ws://localhost:${actualPort}`,
    messages,
    get lastMessage() {
      return messages.length > 0 ? messages[messages.length - 1].data : null;
    },
    clients,
    close() {
      server.stop();
    },
    broadcast(data: any) {
      const msg = JSON.stringify(data);
      for (const client of clients) {
        client.send(msg);
      }
    },
    waitForMessage(timeout = 5000): Promise<MockMessage> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Timeout waiting for message"));
        }, timeout);

        messageResolvers.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
  };
}

/**
 * Wait for WebSocket to open
 */
export function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error("WebSocket connection timeout"));
    }, 5000);

    ws.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    });

    ws.addEventListener("error", (e) => {
      clearTimeout(timeout);
      reject(new Error("WebSocket error"));
    });
  });
}

/**
 * Wait for WebSocket to receive a message
 */
export function waitForMessage(ws: WebSocket, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for message"));
    }, timeout);

    const handler = (event: MessageEvent) => {
      clearTimeout(timer);
      ws.removeEventListener("message", handler);
      try {
        resolve(JSON.parse(event.data));
      } catch {
        resolve(event.data);
      }
    };

    ws.addEventListener("message", handler);
  });
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
