export const exerciseCategories = [
  {
    id: 'hombro',
    title: 'Hombro',
    items: [
      { id: 'hombro-elevacion-hacia-adelante', name: 'Elevación hacia adelante' },
      { id: 'hombro-elevacion-laterales', name: 'Elevación hacia los laterales' },
      { id: 'hombro-rotacion-interna', name: 'Rotación interna' },
      { id: 'hombro-rotacion-externa', name: 'Rotación externa' },
      { id: 'hombro-extension', name: 'Extensión' }
    ]
  },
  { id: 'codo', title: 'Codo', items: [] },
  {
    id: 'antebrazo',
    title: 'Antebrazo',
    items: [
      { id: 'antebrazo-supinacion', name: 'Supinación' },
      { id: 'antebrazo-pronacion', name: 'Pronación' }
    ]
  },
  {
    id: 'muneca',
    title: 'Muñeca',
    items: [
      { id: 'muneca-flexoextension', name: 'Flexoextensión' },
      { id: 'muneca-desviaciones', name: 'Desviaciones' }
    ]
  },
  {
    id: 'mano',
    title: 'Mano',
    items: [
      { id: 'mano-puños', name: 'Puños' },
      { id: 'mano-disociacion-digital', name: 'Disociación digital' },
      { id: 'mano-prensiones', name: 'Prensiones' }
    ]
  },
  { id: 'ejercicios-globales', title: 'Ejercicios globales', items: [] }
]

export const exercisesById = new Map(
  exerciseCategories.flatMap((category) => category.items.map((exercise) => [exercise.id, exercise]))
)
