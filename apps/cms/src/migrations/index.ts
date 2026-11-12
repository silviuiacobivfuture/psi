import * as migration_20261111_211933_initial from './20261111_211933_initial';
import * as migration_20261111_232254_blog_platform from './20261111_232254_blog_platform';
import * as migration_20261111_232600_ai_exchange_limits from './20261111_232600_ai_exchange_limits';
import * as migration_20261111_233616_ai_screening_level from './20261111_233616_ai_screening_level';
import * as migration_20261111_235929_offerings from './20261111_235929_offerings';
import * as migration_20261112_014550_control_plane from './20261112_014550_control_plane';
import * as migration_20261112_022246_knowledge_sources from './20261112_022246_knowledge_sources';

export const migrations = [
  {
    up: migration_20261111_211933_initial.up,
    down: migration_20261111_211933_initial.down,
    name: '20261111_211933_initial',
  },
  {
    up: migration_20261111_232254_blog_platform.up,
    down: migration_20261111_232254_blog_platform.down,
    name: '20261111_232254_blog_platform',
  },
  {
    up: migration_20261111_232600_ai_exchange_limits.up,
    down: migration_20261111_232600_ai_exchange_limits.down,
    name: '20261111_232600_ai_exchange_limits',
  },
  {
    up: migration_20261111_233616_ai_screening_level.up,
    down: migration_20261111_233616_ai_screening_level.down,
    name: '20261111_233616_ai_screening_level',
  },
  {
    up: migration_20261111_235929_offerings.up,
    down: migration_20261111_235929_offerings.down,
    name: '20261111_235929_offerings',
  },
  {
    up: migration_20261112_014550_control_plane.up,
    down: migration_20261112_014550_control_plane.down,
    name: '20261112_014550_control_plane',
  },
  {
    up: migration_20261112_022246_knowledge_sources.up,
    down: migration_20261112_022246_knowledge_sources.down,
    name: '20261112_022246_knowledge_sources'
  },
];
