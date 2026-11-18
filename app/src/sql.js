export function translatePlaceholders(sql) {
  let index = 0;
  const text = String(sql).replace(/\?/g, () => {
    index += 1;
    return "$" + index;
  });
  return { text, count: index };
}
