// Mientras se restaura una copia de seguridad la base se cierra y se vuelve a abrir: ningún sync debe empezar
let active = false;

export const maintenance = {
  active: () => active,
  set: (value: boolean) => {
    active = value;
  },
};
