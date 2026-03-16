const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export const callClaude = async (messages, system) => {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error("Anthropic API Key is missing. Please add VITE_ANTHROPIC_API_KEY to your .env file.");
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1000,
      system,
      messages,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  
  return data.content?.find((b) => b.type === "text")?.text || "";
};
