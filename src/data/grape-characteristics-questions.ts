export type GrapeCharacteristicQuestionDef = {
  id: string;
  difficulty: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  requiredGrapes: string[];
};

type GrapeCharacteristicProfile = {
  grape: string;
  difficulty: number;
  descriptors: [string, string, string];
  grapeOptions: [string, string, string, string];
};

function formatDescriptorList([first, second, third]: [string, string, string]): string {
  return `${first}, ${second}, and ${third}`;
}

function formatDescriptorSet([first, second, third]: [string, string, string]): string {
  return `${first}, ${second}, ${third}`;
}

const GRAPE_PROFILES: GrapeCharacteristicProfile[] = [
  {
    grape: "Riesling",
    difficulty: 2,
    descriptors: ["petroleum", "lemon", "green apple"],
    grapeOptions: ["Sauvignon Blanc", "Riesling", "Chardonnay", "Chenin Blanc"],
  },
  {
    grape: "Sauvignon Blanc",
    difficulty: 2,
    descriptors: ["gooseberry", "grass", "green bell pepper"],
    grapeOptions: ["Riesling", "Chardonnay", "Sauvignon Blanc", "Chenin Blanc"],
  },
  {
    grape: "Chardonnay",
    difficulty: 2,
    descriptors: ["apple", "lemon", "pineapple"],
    grapeOptions: ["Chardonnay", "Riesling", "Semillon", "Chenin Blanc"],
  },
  {
    grape: "Chenin Blanc",
    difficulty: 2,
    descriptors: ["quince", "apple", "honey"],
    grapeOptions: ["Semillon", "Chardonnay", "Chenin Blanc", "Riesling"],
  },
  {
    grape: "Gewurztraminer",
    difficulty: 2,
    descriptors: ["lychee", "rose", "ginger"],
    grapeOptions: ["Viognier", "Moscato Bianco", "Gewurztraminer", "Riesling"],
  },
  {
    grape: "Viognier",
    difficulty: 2,
    descriptors: ["apricot", "peach", "honeysuckle"],
    grapeOptions: ["Gewurztraminer", "Viognier", "Chardonnay", "Moscato Bianco"],
  },
  {
    grape: "Semillon",
    difficulty: 2,
    descriptors: ["lemon", "lanolin", "beeswax"],
    grapeOptions: ["Chardonnay", "Sauvignon Blanc", "Chenin Blanc", "Semillon"],
  },
  {
    grape: "Moscato Bianco",
    difficulty: 2,
    descriptors: ["orange blossom", "grape", "peach"],
    grapeOptions: ["Moscato Bianco", "Gewurztraminer", "Viognier", "Chardonnay"],
  },
  {
    grape: "Fiano",
    difficulty: 2,
    descriptors: ["pear", "hazelnut", "honey"],
    grapeOptions: ["Garganega", "Fiano", "Verdicchio", "Chardonnay"],
  },
  {
    grape: "Garganega",
    difficulty: 2,
    descriptors: ["pear", "chamomile", "almond"],
    grapeOptions: ["Verdicchio", "Garganega", "Fiano", "Albarino"],
  },
  {
    grape: "Verdicchio",
    difficulty: 2,
    descriptors: ["lemon", "green apple", "bitter almond"],
    grapeOptions: ["Fiano", "Albarino", "Verdicchio", "Garganega"],
  },
  {
    grape: "Albarino",
    difficulty: 2,
    descriptors: ["peach", "lemon", "saline"],
    grapeOptions: ["Sauvignon Blanc", "Riesling", "Albarino", "Chardonnay"],
  },
  {
    grape: "Cabernet Sauvignon",
    difficulty: 3,
    descriptors: ["blackcurrant", "cedar", "green bell pepper"],
    grapeOptions: ["Merlot", "Cabernet Sauvignon", "Malbec", "Carmenere"],
  },
  {
    grape: "Merlot",
    difficulty: 3,
    descriptors: ["plum", "blackberry", "chocolate"],
    grapeOptions: ["Malbec", "Cabernet Sauvignon", "Merlot", "Carmenere"],
  },
  {
    grape: "Cabernet Franc",
    difficulty: 3,
    descriptors: ["red currant", "bell pepper", "violet"],
    grapeOptions: ["Pinot Noir", "Cabernet Franc", "Cabernet Sauvignon", "Sangiovese"],
  },
  {
    grape: "Syrah",
    difficulty: 3,
    descriptors: ["blackberry", "black pepper", "smoked meat"],
    grapeOptions: ["Malbec", "Grenache", "Syrah", "Cabernet Sauvignon"],
  },
  {
    grape: "Pinot Noir",
    difficulty: 3,
    descriptors: ["red cherry", "raspberry", "mushroom"],
    grapeOptions: ["Pinot Noir", "Sangiovese", "Gamay", "Nebbiolo"],
  },
  {
    grape: "Sangiovese",
    difficulty: 3,
    descriptors: ["sour cherry", "dried herbs", "tomato"],
    grapeOptions: ["Tempranillo", "Pinot Noir", "Sangiovese", "Nebbiolo"],
  },
  {
    grape: "Nebbiolo",
    difficulty: 3,
    descriptors: ["rose", "tar", "cherry"],
    grapeOptions: ["Pinot Noir", "Nebbiolo", "Sangiovese", "Gamay"],
  },
  {
    grape: "Malbec",
    difficulty: 3,
    descriptors: ["blackberry", "plum", "violet"],
    grapeOptions: ["Cabernet Sauvignon", "Merlot", "Syrah", "Malbec"],
  },
  {
    grape: "Carmenere",
    difficulty: 3,
    descriptors: ["black plum", "green bell pepper", "cocoa"],
    grapeOptions: ["Cabernet Franc", "Carmenere", "Merlot", "Cabernet Sauvignon"],
  },
  {
    grape: "Tempranillo",
    difficulty: 3,
    descriptors: ["strawberry", "plum", "leather"],
    grapeOptions: ["Grenache", "Tempranillo", "Merlot", "Sangiovese"],
  },
  {
    grape: "Grenache",
    difficulty: 3,
    descriptors: ["strawberry", "raspberry", "white pepper"],
    grapeOptions: ["Gamay", "Pinot Noir", "Grenache", "Sangiovese"],
  },
  {
    grape: "Gamay",
    difficulty: 3,
    descriptors: ["raspberry", "red cherry", "violet"],
    grapeOptions: ["Pinot Noir", "Gamay", "Grenache", "Sangiovese"],
  },
  {
    grape: "Touriga Nacional",
    difficulty: 3,
    descriptors: ["blackberry", "violet", "blackcurrant"],
    grapeOptions: ["Touriga Nacional", "Cabernet Sauvignon", "Malbec", "Syrah"],
  },
];

const descriptorsByGrape = new Map(GRAPE_PROFILES.map((profile) => [profile.grape, profile.descriptors] as const));

function createQuestionsForProfile(profile: GrapeCharacteristicProfile): GrapeCharacteristicQuestionDef[] {
  const correctIndex = profile.grapeOptions.indexOf(profile.grape);
  if (correctIndex < 0) {
    throw new Error(`Missing correct grape option for ${profile.grape}`);
  }

  const descriptorOptions = profile.grapeOptions.map((grape) => {
    const descriptors = descriptorsByGrape.get(grape);
    if (!descriptors) {
      throw new Error(`Missing descriptor profile for ${grape}`);
    }
    return formatDescriptorSet(descriptors);
  });

  return [
    {
      id: `grape-char:grape-from-characteristics:${profile.grape.toLowerCase().replace(/\s+/g, "-")}`,
      difficulty: profile.difficulty,
      prompt: `Which grape shows characteristics of ${formatDescriptorList(profile.descriptors)}?`,
      options: [...profile.grapeOptions],
      correctIndex,
      requiredGrapes: [profile.grape],
    },
    {
      id: `grape-char:characteristics-from-grape:${profile.grape.toLowerCase().replace(/\s+/g, "-")}`,
      difficulty: profile.difficulty,
      prompt: `${profile.grape} shows which of the following sets of characteristics?`,
      options: descriptorOptions,
      correctIndex,
      requiredGrapes: [profile.grape],
    },
  ];
}

export const GRAPE_CHARACTERISTIC_QUESTIONS: GrapeCharacteristicQuestionDef[] = GRAPE_PROFILES.flatMap(
  createQuestionsForProfile,
);
