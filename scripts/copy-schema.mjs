import {copyFileSync,existsSync} from 'node:fs';
if(existsSync('src/schema.graphql')) copyFileSync('src/schema.graphql','dist/src/schema.graphql');
