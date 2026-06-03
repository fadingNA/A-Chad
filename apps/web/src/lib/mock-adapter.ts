import type { ChatModelAdapter } from "@assistant-ui/react";

const MOCK_RESPONSES = [
  `Sure! Here's a quick example in Python:

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("World"))
\`\`\`

This function takes a **name** parameter and returns a greeting string. You can call it with any name you like.

Is there anything else you'd like to know?`,

  `Great question! Here are the key differences:

| Feature | React | Vue |
|---------|-------|-----|
| Learning curve | Moderate | Easy |
| Performance | Excellent | Excellent |
| Ecosystem | Massive | Large |
| JSX | Yes | Optional |

Both are excellent choices for building modern web applications. **React** has a larger ecosystem, while **Vue** is often considered easier to learn.`,

  `I can help you with that. Here's a breakdown:

1. **First**, identify the core problem you're trying to solve.
2. **Then**, break it into smaller, manageable pieces.
3. **Finally**, tackle each piece one at a time.

> "The secret of getting ahead is getting started." — Mark Twain

Would you like me to go deeper on any of these steps?`,

  `Absolutely! Here's how you'd implement that in TypeScript:

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

async function fetchUser(id: number): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  if (!response.ok) throw new Error("User not found");
  return response.json();
}
\`\`\`

The key things to note:
- We define a **typed interface** for the response shape
- We use **async/await** for clean asynchronous code
- We handle errors with a simple check on \`response.ok\``,
];

let responseIndex = 0;

export const mockAdapter: ChatModelAdapter = {
  async *run({ abortSignal }) {
    const fullText = MOCK_RESPONSES[responseIndex % MOCK_RESPONSES.length];
    responseIndex++;

    const chars = fullText.split("");
    let accumulated = "";

    for (const char of chars) {
      if (abortSignal.aborted) break;
      accumulated += char;
      yield { content: [{ type: "text", text: accumulated }] };
      await new Promise((r) => setTimeout(r, 12));
    }
  },
};
