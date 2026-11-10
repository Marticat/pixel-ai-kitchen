// Only deliberately authored messages may cross the API boundary.
export class KitchenError extends Error {
 constructor(message,status=400){super(message);this.name='KitchenError';this.status=status;}
}
export function publicErrorMessage(error,fallback='Service temporarily unavailable. Please try again later.'){
 return error instanceof KitchenError?error.message:fallback;
}
