# Security policy

## Reporting a vulnerability

Report a vulnerability in this repo through GitHub's private vulnerability
reporting: open the **Security** tab of this repository, then **Report a
vulnerability**. Do not open a public issue for a security problem.

If private reporting is not available, email the nf-core core team at
core@nf-co.re.

## Trust boundary

This repo runs code from 141 pipeline repos, through the reusable workflows it
publishes. A job that runs pull request code gets no secrets and only read-only
scopes. A job that holds credentials, such as a token that can push a tag or
comment on a pull request, never runs pull request code directly. Data that must
cross from one to the other, such as a test result, crosses as a validated
artifact, not as code the credentialed job executes.
