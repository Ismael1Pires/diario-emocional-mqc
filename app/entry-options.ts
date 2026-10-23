export function detailOther(option: string, detail: string) {
  if (option !== 'Outro') return option;
  const value = detail.trim();
  if (!value || value.length > 110) throw new Error('Descreva a opção “Outro” em até 110 caracteres.');
  return `Outro: ${value}`;
}
