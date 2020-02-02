const core = require("@actions/core"),
    github = require("@actions/github");

const token = core.getInput("github-token", { required: true }),
    masterBranch = getBranch("master"),
    label = getInput("label", "자동머지"),
    auto_merge = getInput("auto-merge", "true"),
    auto_merge_branches = getInput("auto-merge-branches", "release"),
    require_merge = getInput("require-merge", "false") == "true",
    context = github.context,
    owner = context.repo.owner,
    repo = context.repo.repo,
    client = new github.GitHub(token);

function getInput(name, fallback) {
    const input = core.getInput(name);
    return input || fallback;
}

function getBranch(name) {
    return getInput(name, name);
}

function isAutoMergeEvent(eventName) {
    if (auto_merge == "true") {
        return true;
    }
    else {
        const auto_merge_events = auto_merge.split(",").map(e => e.trim());
        return auto_merge_events.includes(eventName);
    }
}

async function run() {
    try {
        core.debug(JSON.stringify(context.payload));
        const branchList = await getBranchList();
        core.info(`branchList => ${JSON.stringify(branchList)}`)
        switch (github.context.eventName) {
            case "push": {
                core.info(`auto_merge_branches => ${auto_merge_branches}`)
                const branches = auto_merge_branches.split(",").map(e => e.trim());
                for (const branch of branches) {
                    core.info(`branch = ${branch}`);
                    if(!branch) break;
                    const base = getBranch(branch);
                    core.info(`base branch = ${base}`);
                    if(branchList.includes(base)){
                        await push(base);
                    } else {
                        core.error(`${base} 브랜치가 존재하지 않습니다.`)
                    }
                }
                break;
            }
            case "pull_request_review":
                if (isAutoMergeEvent("pull_request_review")) {
                    if (context.payload.pull_request.labels.map(labelMap).includes(label)) {
                        await merge(context.payload.pull_request.number);
                    }
                    else {
                        core.info(`Pull request does not have the label ${label}. Skipping...`);
                    }
                }
                else {
                    core.info("Auto merge is disabled for pull-request reviews. You should remove the `pull_request_review` event from the action configuration. Skipping...");
                }
                break;

            case "check_run":
                if (isAutoMergeEvent("check_run")) {
                    var prs = context.payload.check_run.pull_requests;
                    if (!prs) {
                        core.info("Empty pull request list. Stepping out...");
                        return;
                    }
                    for (const element of prs) {
                        const pullResponse = await client.pulls.get({
                            owner,
                            pull_number: element.number,
                            repo,
                        }),
                            data = pullResponse.data;
                        core.debug(JSON.stringify(data));
                        if (data.labels.map(labelMap).includes(label)) {
                            await merge(element.number);
                        }
                        else {
                            core.info(`Pull request #${element.number} does not have the label ${label}. Skipping...`);
                        }
                    }
                }
                else {
                    core.info("Auto merge is disabled for check runs. You should remove the `check_run` event from the action configuration. Skipping...");
                }
                break;
        }
    }
    catch (err) {
        //Even if it's a valid situation, we want to fail the action in order to be able to find the issue and fix it.
        core.setFailed(err.message);
        core.debug(JSON.stringify(err));
    }
}

function labelMap(label) {
    return label.name;
}

async function push(targetBranch) {
    const head = context.ref.substr(11);
    core.info(`head => ${head}`)
    const pulls = await client.pulls.list({
        base: targetBranch,
        head: `${owner}:${head}`,
        owner,
        repo,
        state: "open",
    });
    core.debug(JSON.stringify(pulls.data));
    let pull_number;
    if (pulls.data.length === 1) {
        const data = pulls.data[0];
        pull_number = data.number;
        core.info(`#${pull_number}(master -> ${targetBranch}) 풀리퀘가 이미 존재합니다.`);
        // 풀리퀘 label이 '자동머지'인 경우에만 푸시가 되고 머지가 된다.
        const labels = data.labels.map(labelMap);
        core.info(`labels => ${labels}`)
        if (!labels.includes(label)) {
            core.info(`Pull request does not have the label ${label}. Skipping...`);
            return;
        }
    }
    else {
        const creationResponse = await client.pulls.create({
            base: targetBranch,
            head,
            owner,
            repo,
            title: `${head} -> ${targetBranch}`,
        }),
            creationData = creationResponse.data;
        pull_number = creationData.number;
        core.info(`Pull request #${pull_number} created.`);
        core.debug(JSON.stringify(creationData));
        const labelsResponse = await client.issues.addLabels({
            issue_number: pull_number,
            labels: [label],
            owner,
            repo,
        });
        core.info(`Label ${label} added to #${pull_number}.`);
        core.debug(JSON.stringify(labelsResponse.data));
    }
    if (isAutoMergeEvent("push")) {
        await merge(pull_number);
    }
    else {
        core.info("Auto merge is disabled for pushes. Skipping...");
    }
}

async function merge(pull_number) {
    try {
        const mergeResponse = await client.pulls.merge({
            owner,
            pull_number,
            repo,
        });
        core.info(`Pull request #${pull_number} merged.`);
        core.debug(JSON.stringify(mergeResponse.data));
    }
    catch (err) {
        if (require_merge) {
            core.setFailed("Merge failed.");
        } else {
            core.info("Merge failed.");
        }
        core.debug(err);
    }
}

/**
 * 브랜치 목록 취득.
 * @returns {Promise<*>}
 */
async function getBranchList() {
    const { data : branches} = await client.repos.listBranches({
        owner,
        repo
    });

    return branches.map(branch => branch.name);
}

run();
