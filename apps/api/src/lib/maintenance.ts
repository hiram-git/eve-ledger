// While a backup is being restored the database is closed and reopened: no sync must start
let active = false;

export const maintenance = {
  active: () => active,
  set: (value: boolean) => {
    active = value;
  },
};
