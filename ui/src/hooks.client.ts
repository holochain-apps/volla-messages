import type { HandleClientError } from "@sveltejs/kit";

export const handleError: HandleClientError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID();

  console.error(`Error ID: ${errorId}`, error, event, status, message);

  return {
    message: `An error occurred: ${message}`,
    errorId,
  };
};
