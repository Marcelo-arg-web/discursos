// Compatibilidad: algunos deployments antiguos referencian /visitantes.js sin type=module.
// Este loader funciona como script clásico y carga el módulo real.
(async () => {
  await import('./js/pages/visitantes.js');
})().catch((e) => {
  console.error('Error cargando módulo de visitantes:', e);
});
