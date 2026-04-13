export const floorPlanReferenceCorpus = {
  generatedAt: "2026-04-12T11:14:09.514744+00:00",
  houseExpo: {
    source: {
      repoUrl: "https://github.com/TeaganLi/HouseExpo",
      archivePath: "data/external/HouseExpo/HouseExpo/json.tar.gz",
      repositoryCommit: "45e2b2505f6ea1fe49c0203f14efb7ce20b94e7c",
      license: "MIT",
    },
    stats: {
      planCount: 35126,
      roomCount: {
        mean: 7.43,
        median: 7.0,
        p10: 3,
        p90: 12,
      },
      bboxMeters: {
        meanWidth: 14.4,
        meanDepth: 11.93,
      },
      topCategories: [
        {
          category: "bedroom",
          instanceCount: 45911,
          planCount: 24938,
          planShare: 0.71,
          meanApproxAreaM2: 66.67,
        },
        {
          category: "bathroom",
          instanceCount: 34595,
          planCount: 25978,
          planShare: 0.7396,
          meanApproxAreaM2: 33.19,
        },
        {
          category: "wc",
          instanceCount: 29611,
          planCount: 21635,
          planShare: 0.6159,
          meanApproxAreaM2: 30.4,
        },
        {
          category: "kitchen",
          instanceCount: 29211,
          planCount: 26921,
          planShare: 0.7664,
          meanApproxAreaM2: 57.73,
        },
        {
          category: "flex_room",
          instanceCount: 25067,
          planCount: 11022,
          planShare: 0.3138,
          meanApproxAreaM2: 140.88,
        },
        {
          category: "living_room",
          instanceCount: 19318,
          planCount: 17704,
          planShare: 0.504,
          meanApproxAreaM2: 76.87,
        },
        {
          category: "hallway",
          instanceCount: 14982,
          planCount: 9599,
          planShare: 0.2733,
          meanApproxAreaM2: 55.95,
        },
        {
          category: "office",
          instanceCount: 13151,
          planCount: 10716,
          planShare: 0.3051,
          meanApproxAreaM2: 67.98,
        },
        {
          category: "dining_room",
          instanceCount: 12983,
          planCount: 12067,
          planShare: 0.3435,
          meanApproxAreaM2: 73.08,
        },
        {
          category: "garage",
          instanceCount: 9101,
          planCount: 8553,
          planShare: 0.2435,
          meanApproxAreaM2: 62.24,
        },
        {
          category: "balcony",
          instanceCount: 3574,
          planCount: 2753,
          planShare: 0.0784,
          meanApproxAreaM2: 43.62,
        },
        {
          category: "gym",
          instanceCount: 3333,
          planCount: 3214,
          planShare: 0.0915,
          meanApproxAreaM2: 61.93,
        },
      ],
    },
    referenceExamples: [
      {
        id: "451c05cd7bc849cde626d29b82a215df",
        roomCount: 4,
        bboxMeters: {
          width: 10.06,
          depth: 10.06,
        },
        categories: [
          {
            category: "bedroom",
            count: 1,
          },
          {
            category: "entryway",
            count: 1,
          },
          {
            category: "kitchen",
            count: 1,
          },
          {
            category: "terrace",
            count: 1,
          },
        ],
      },
      {
        id: "2a65fde31d7c01c6f555c6fa729e9cd9",
        roomCount: 6,
        bboxMeters: {
          width: 10.06,
          depth: 10.06,
        },
        categories: [
          {
            category: "flex_room",
            count: 2,
          },
          {
            category: "bathroom",
            count: 1,
          },
          {
            category: "bedroom",
            count: 1,
          },
          {
            category: "dining_room",
            count: 1,
          },
          {
            category: "wc",
            count: 1,
          },
        ],
      },
      {
        id: "08ac28e66e083c63914a5c1693178cb2",
        roomCount: 8,
        bboxMeters: {
          width: 15.16,
          depth: 15.16,
        },
        categories: [
          {
            category: "flex_room",
            count: 3,
          },
          {
            category: "aeration",
            count: 1,
          },
          {
            category: "terrace",
            count: 1,
          },
        ],
      },
      {
        id: "c03bb2fb0fc00af53fbe3619f22b681f",
        roomCount: 10,
        bboxMeters: {
          width: 15.76,
          depth: 15.76,
        },
        categories: [
          {
            category: "bathroom",
            count: 4,
          },
          {
            category: "bedroom",
            count: 2,
          },
          {
            category: "guest_room",
            count: 1,
          },
          {
            category: "hallway",
            count: 1,
          },
          {
            category: "kitchen",
            count: 1,
          },
        ],
      },
      {
        id: "61bee22038b40cd77821422632c6a065",
        roomCount: 12,
        bboxMeters: {
          width: 20.26,
          depth: 20.26,
        },
        categories: [
          {
            category: "bedroom",
            count: 4,
          },
          {
            category: "bathroom",
            count: 1,
          },
          {
            category: "kitchen",
            count: 1,
          },
          {
            category: "living_room",
            count: 1,
          },
          {
            category: "wc",
            count: 1,
          },
        ],
      },
      {
        id: "03e7739c6f7e14b4b041aec017c438d7",
        roomCount: 0,
        bboxMeters: {
          width: 27.45,
          depth: 9.42,
        },
        categories: [],
      },
    ],
  },
  roboflowProfiles: [
    {
      id: "floor_plan_objects",
      title: "Floor_Plan_Objects",
      datasetUrl:
        "https://universe.roboflow.com/floor-plan-rendering/floor_plan_objects",
      task: "object-detection",
      license: "CC BY 4.0",
      intendedUse: "technical floor-plan symbol priors and object vocabulary",
      symbolFamilies: [
        "doors",
        "windows",
        "stairs",
        "toilets",
        "sinks",
        "showers",
        "kitchen_appliances",
        "beds",
        "sofas",
        "wardrobes",
        "study_tables",
      ],
      note: "Symbol families are distilled from public floor-plan object datasets. If you export a local Roboflow snapshot, enrich this profile with exact class names.",
    },
    {
      id: "door_object_detection",
      title: "Door Object Detection",
      datasetUrl:
        "https://universe.roboflow.com/architecture-plan/door-object-detection",
      task: "object-detection",
      license: "CC BY 4.0",
      intendedUse: "door-placement and opening-symbol priors",
      symbolFamilies: ["doors"],
      note: "Small focused dataset for opening detection in architectural plans.",
    },
  ],
};

export default floorPlanReferenceCorpus;
