export interface RepositoryContentInput {
  repositoryPath: string;
  commitSha: string;
}

export interface RepositoryFileInput extends RepositoryContentInput {
  path: string;
}

export interface RepositoryContentPort {
  listFiles(input: RepositoryContentInput): Promise<string[]>;
  readFile(input: RepositoryFileInput): Promise<string>;
}
