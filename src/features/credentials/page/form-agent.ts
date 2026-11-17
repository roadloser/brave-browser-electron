export function captureForm(): { username: string; password: string } | null {
  const passwords = [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter(input => !input.disabled && input.getClientRects().length > 0 && input.value);
  const password = passwords.find(input => input.autocomplete === 'current-password') ?? passwords[0];
  if (!password) return null;
  const scope = password.form ?? document;
  const usernames = [...scope.querySelectorAll<HTMLInputElement>('input')].filter(input => !input.disabled && input.type !== 'password' && input.getClientRects().length > 0);
  const username = usernames.find(input => input.autocomplete === 'username') ?? usernames.find(input => input.type === 'email') ?? usernames.find(input => ['text', 'tel'].includes(input.type));
  return { username: username?.value ?? '', password: password.value };
}

export function fillForm(value: { username: string; password: string }): boolean {
  const password = [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].find(input => !input.disabled && input.getClientRects().length > 0 && input.autocomplete !== 'new-password');
  if (!password) return false;
  const scope = password.form ?? document;
  const inputs = [...scope.querySelectorAll<HTMLInputElement>('input')].filter(input => !input.disabled && input.getClientRects().length > 0);
  const username = inputs.find(input => input.autocomplete === 'username') ?? inputs.find(input => input.type === 'email') ?? inputs.find(input => input.type === 'text');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) return false;
  for (const [input, text] of [[username, value.username], [password, value.password]] as const) {
    if (!input) continue;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}
