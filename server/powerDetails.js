const toKw = (value) => Number(Number(value ?? 0).toFixed(4));

const normalizeMeterType = (value) => String(value ?? "").toUpperCase().replace(/[^A-Z]/g, "");

export const normalizePowerDetails = (powerDetails) => {
  const pointsByDate = new Map();
  const meters = powerDetails?.meters ?? [];

  const fieldByType = {
    PRODUCTION: "productionKw",
    CONSUMPTION: "consumptionKw",
    FEEDIN: "toGridKw",
    PURCHASED: "fromGridKw",
    SELFCONSUMPTION: "fromPvKw",
  };

  for (const meter of meters) {
    const type = normalizeMeterType(meter?.type);
    const field = fieldByType[type];

    if (!field) {
      continue;
    }

    for (const entry of meter.values ?? []) {
      const date = entry?.date;

      if (!date) {
        continue;
      }

      const current = pointsByDate.get(date) ?? {
        date,
        productionKw: 0,
        toBuildingKw: 0,
        toGridKw: 0,
        consumptionKw: 0,
        fromPvKw: 0,
        fromGridKw: 0,
      };

      current[field] = toKw(entry.value);
      pointsByDate.set(date, current);
    }
  }

  return [...pointsByDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row) => {
      const fromPvKw = row.fromPvKw > 0 ? row.fromPvKw : Math.min(row.productionKw, row.consumptionKw);
      const toBuildingKw = row.toBuildingKw > 0 ? row.toBuildingKw : fromPvKw;
      const toGridKw = row.toGridKw > 0 ? row.toGridKw : Math.max(row.productionKw - fromPvKw, 0);
      const fromGridKw = row.fromGridKw > 0 ? row.fromGridKw : Math.max(row.consumptionKw - fromPvKw, 0);

      return {
        ...row,
        fromPvKw: toKw(fromPvKw),
        toBuildingKw: toKw(toBuildingKw),
        toGridKw: toKw(toGridKw),
        fromGridKw: toKw(fromGridKw),
      };
    });
};
