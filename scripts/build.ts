export {}
await import('./notices.ts')
for (const [entry, target] of [['backend', 'bun'], ['frontend', 'browser']] as const) {
  const result = await Bun.build({
    entrypoints: [`src/${entry}.ts`],
    outdir: 'dist',
    naming: '[name].js',
    target,
    minify: true,
  })
  if (!result.success) throw new AggregateError(result.logs, `${entry} build failed`)
  console.log(`${entry}: ${result.outputs[0]?.size.toLocaleString()} bytes`)
}
