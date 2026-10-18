const WorkbenchTime = (() => {
  const ISO_WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?/u;

  function marketTimestampMilliseconds(value) {
    if (value === null || value === undefined || value === "") return NaN;
    if (typeof value === "number") return Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
    if (value instanceof Date) return value.getTime();
    const match = ISO_WALL_CLOCK.exec(String(value).trim());
    if (match) {
      const [, year, month, day, hour, minute, second = "0", fraction = "0"] = match;
      return Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        Number(fraction.padEnd(3, "0")),
      );
    }
    return Date.parse(String(value));
  }

  function marketTimestampSeconds(value) {
    const milliseconds = marketTimestampMilliseconds(value);
    return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
  }

  function formatMarketDateTime(value) {
    const parts = marketParts(value);
    if (!parts) return String(value ?? "");
    return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
  }

  function formatMarketTime(value) {
    const parts = marketParts(value);
    return parts ? `${parts.hour}:${parts.minute}` : String(value ?? "");
  }

  function marketParts(value) {
    const milliseconds = marketTimestampMilliseconds(value);
    if (!Number.isFinite(milliseconds)) return null;
    const date = new Date(milliseconds);
    return {
      year: String(date.getUTCFullYear()).padStart(4, "0"),
      month: String(date.getUTCMonth() + 1).padStart(2, "0"),
      day: String(date.getUTCDate()).padStart(2, "0"),
      hour: String(date.getUTCHours()).padStart(2, "0"),
      minute: String(date.getUTCMinutes()).padStart(2, "0"),
    };
  }

  return {
    formatMarketDateTime,
    formatMarketTime,
    marketTimestampMilliseconds,
    marketTimestampSeconds,
  };
})();
