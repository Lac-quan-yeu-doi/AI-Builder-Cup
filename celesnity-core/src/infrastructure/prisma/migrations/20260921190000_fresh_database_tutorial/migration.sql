UPDATE "celesnity_app"."tutorial_definitions"
SET
  "metadata" = '{"title":"Create a database and discover source schema","summary":"Create a database, connect a data source, and crawl its schema from a clean workspace.","category":"Getting started","learningOutcomes":["Create a managed database for discovered metadata","Connect a database source","Assign and run a metadata crawler","Browse the discovered source schema"],"estimatedMinutes":12,"stepCount":12}'::jsonb,
  "steps" = '[
    {"id":"database-onboarding-open-create","order":1,"title":"Create a database","instructionalContent":"Start with a database that will contain the metadata discovered from your source. Select Create database.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/catalog/databases","targetControl":{"id":"create-database","accessibleName":"Create database","selector":"[data-tutorial-target=\"create-database\"]"}},
    {"id":"database-onboarding-save-database","order":2,"title":"Save the database","instructionalContent":"Give the database a short name using letters, numbers, or underscores, then create it.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/catalog/databases","requiredAction":{"id":"create-database","accessibleName":"Create database"},"targetControl":{"id":"submit-create-database","accessibleName":"Create database","selector":"[data-tutorial-target=\"submit-create-database\"]"}},
    {"id":"database-onboarding-open-database","order":3,"title":"Open the database","instructionalContent":"Open the database you created to add its first data source.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/catalog/databases","targetControl":{"id":"tutorial-database","accessibleName":"Created database","selector":"[data-tutorial-target=\"tutorial-database\"]"}},
    {"id":"database-onboarding-open-sources","order":4,"title":"Open Sources","instructionalContent":"Sources are the systems this database reads metadata from. Open the Sources tab.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/databases/:database","targetControl":{"id":"database-sources-tab","accessibleName":"Sources","selector":"[data-tutorial-target=\"database-sources-tab\"]"}},
    {"id":"database-onboarding-open-connection","order":5,"title":"Connect a data source","instructionalContent":"Add the database system whose schemas and tables you want to discover.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/databases/:database?tab=sources","targetControl":{"id":"new-database-source","accessibleName":"New connection","selector":"[data-tutorial-target=\"new-database-source\"]"}},
    {"id":"database-onboarding-save-connection","order":6,"title":"Save the data source","instructionalContent":"Choose a connector and enter credentials that can read metadata, then save the service.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/databases/:database?tab=sources","requiredAction":{"id":"create-database-source","accessibleName":"Save service"},"targetControl":{"id":"save-database-source","accessibleName":"Save service","selector":"[data-tutorial-target=\"save-database-source\"]"}},
    {"id":"database-onboarding-open-source","order":7,"title":"Open the data source","instructionalContent":"Open the source you just connected to configure schema discovery.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/databases/:database?tab=sources","targetControl":{"id":"tutorial-database-source","accessibleName":"Created data source","selector":"[data-tutorial-target=\"tutorial-database-source\"]"}},
    {"id":"database-onboarding-open-scan","order":8,"title":"Open Metadata scan","instructionalContent":"The Metadata scan tab contains the crawler that discovers schemas, tables, and columns.","destinationFeature":"CRAWLER","destinationHref":"/databases/:database/sources/:sourceId","targetControl":{"id":"source-scan-tab","accessibleName":"Metadata scan","selector":"[data-tutorial-target=\"source-scan-tab\"]"}},
    {"id":"database-onboarding-open-crawler-dialog","order":9,"title":"Assign a crawler","instructionalContent":"Assign a metadata crawler to this source and choose when it should refresh the schema.","destinationFeature":"CRAWLER","destinationHref":"/databases/:database/sources/:sourceId?tab=scan","targetControl":{"id":"assign-metadata-crawler","accessibleName":"Assign crawler","selector":"[data-tutorial-target=\"assign-metadata-crawler\"]"}},
    {"id":"database-onboarding-save-crawler","order":10,"title":"Save crawler assignment","instructionalContent":"Keep or adjust the schedule, then save the crawler assignment.","destinationFeature":"CRAWLER","destinationHref":"/databases/:database/sources/:sourceId?tab=scan","requiredAction":{"id":"assign-metadata-crawler","accessibleName":"Save assignment"},"targetControl":{"id":"save-metadata-crawler","accessibleName":"Save assignment","selector":"[data-tutorial-target=\"save-metadata-crawler\"]"}},
    {"id":"database-onboarding-run-crawler","order":11,"title":"Run the crawler","instructionalContent":"Run the crawler now so the source schema is discovered without waiting for the schedule.","destinationFeature":"CRAWLER","destinationHref":"/databases/:database/sources/:sourceId?tab=scan","requiredAction":{"id":"run-metadata-crawler","accessibleName":"Scan now"},"targetControl":{"id":"run-metadata-crawler","accessibleName":"Scan now","selector":"[data-tutorial-target=\"run-metadata-crawler\"]"}},
    {"id":"database-onboarding-browse-schema","order":12,"title":"Browse discovered schema","instructionalContent":"Open Tables to review the schemas, tables, and columns discovered by the crawler.","destinationFeature":"SOURCE_SCHEMA","destinationHref":"/databases/:database/sources/:sourceId?tab=scan","targetControl":{"id":"source-tables-tab","accessibleName":"Tables","selector":"[data-tutorial-target=\"source-tables-tab\"]"}}
  ]'::jsonb,
  "required_features" = ARRAY['CATALOG_DATABASES','CRAWLER','SOURCE_SCHEMA'],
  "prerequisites" = '[]'::jsonb,
  "context_requirements" = '[]'::jsonb,
  "revision" = "revision" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'tutorial-connections-basics';

-- The previous revision assumed an existing database service. Its step IDs and
-- selected context cannot safely carry into this fresh-workspace journey.
-- Completion history remains in tutorial_completions and users can repeat the
-- new revision from its first step.
UPDATE "celesnity_app"."tutorial_progress"
SET
  "status" = 'NOT_STARTED',
  "current_step_id" = 'database-onboarding-open-create',
  "completed_step_ids" = ARRAY[]::TEXT[],
  "context_selections" = '[]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "tutorial_id" = 'tutorial-connections-basics';
