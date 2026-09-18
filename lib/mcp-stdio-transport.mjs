export function createStdioTransport(server) {
  return {
    async start() {
      process.stdin.setEncoding('utf8');
      let buffer = '';
      process.stdin.on('data', async chunk => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const request = JSON.parse(line);
          const result = await server.handle(request);
          process.stdout.write(JSON.stringify(result) + '\n');
        }
      });
    }
  };
}
