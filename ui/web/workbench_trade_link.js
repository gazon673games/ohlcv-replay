const WorkbenchTradeLink = (() => {
  function forMarker(id, decisions, trades) {
    const direct = /^trade:(\d+):[01]$/u.exec(id);
    if (direct) return trades[Number(direct[1])] ? [Number(direct[1])] : [];
    const row = decisions.filter(WorkbenchMarketChartData.isExecutionDecision)
      .find((item, index) => WorkbenchMarketChartData.markerId(item, index) === id);
    if (!row) return [];
    const time = WorkbenchTime.marketTimestampSeconds(row.fill_ts ?? row.ts);
    if (time === null) return [];
    const delta = WorkbenchMarketChartData.executedDelta(row);
    const matches = [];
    trades.forEach((trade, index) => {
      if (row.trade_id != null && String(row.trade_id) === String(trade.trade_id)) { matches.push(index); return; }
      const long = (trade.direction || trade.side) !== "short";
      const linked = ["entry", "exit"].some(side => {
        const fillTime = WorkbenchTime.marketTimestampSeconds(trade[`${side}_ts`]);
        if (fillTime !== time) return false;
        const order = trade[`${side}_order_id`];
        if (order != null && row.order_id != null) return String(order) === String(row.order_id);
        const price = trade[`${side}_price`];
        if (price == null || row.fill_price == null || !Number.isFinite(Number(price))) return false;
        const buy = side === "entry" ? long : !long;
        return delta !== 0 && buy === (delta > 0) && Math.abs(Number(price) - Number(row.fill_price)) <= 1e-8;
      });
      if (linked) matches.push(index);
    });
    return matches;
  }
  return { forMarker };
})();
