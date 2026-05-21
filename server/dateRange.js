const pad = (value) => String(value).padStart(2, "0");

export const toDateString = (date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  return `${year}-${month}-${day}`;
};

export const toDateTimeString = (date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const getStartOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const getEndOfDay = (date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const getStartOfWeek = (date) => {
  const next = getStartOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
};

const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const next = new Date(start);
  next.setDate(next.getDate() + 6);
  return getEndOfDay(next);
};

const getStartOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const getEndOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const getStartOfYear = (date) => new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);

const getEndOfYear = (date) => new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);

export const getRangeWindow = (range, dateString) => {
  const baseDate = dateString ? new Date(`${dateString}T00:00:00`) : new Date();

  if (Number.isNaN(baseDate.getTime())) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }

  if (range === "day") {
    return {
      start: getStartOfDay(baseDate),
      end: getEndOfDay(baseDate),
      timeUnit: "DAY",
      title: "Day",
    };
  }

  if (range === "week") {
    return {
      start: getStartOfWeek(baseDate),
      end: getEndOfWeek(baseDate),
      timeUnit: "DAY",
      title: "Week",
    };
  }

  if (range === "month") {
    return {
      start: getStartOfMonth(baseDate),
      end: getEndOfMonth(baseDate),
      timeUnit: "DAY",
      title: "Month",
    };
  }

  if (range === "year") {
    return {
      start: getStartOfYear(baseDate),
      end: getEndOfYear(baseDate),
      timeUnit: "MONTH",
      title: "Year",
    };
  }

  throw new Error("Invalid range. Use day, week, month, or year.");
};
