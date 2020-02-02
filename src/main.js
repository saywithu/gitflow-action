const core = require("@actions/core"),
    github = require("@actions/github");

const token = core.getInput("github-token", { required: true }),
    label = getInput("label", "자동머지"),
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

async function run() {
    try {
        core.debug(JSON.stringify(context.payload));
        if(!auto_merge_branches) return;
        const branchList = await getBranchList();
        core.info(`branchList => ${JSON.stringify(branchList)}`)
        if(github.context.eventName === "push") {
            core.info(`auto_merge_branches => ${auto_merge_branches}`)
            const branches = auto_merge_branches.split(",").map(e => e.trim());
            for (const branch of branches) {
                if(!branch) break;
                const base = getBranch(branch);
                core.info(`base branch = ${base}`);
                if(branchList.includes(base)){
                    await push(base);
                } else {
                    core.error(`${base} 브랜치가 존재하지 않습니다.`)
                }
            }
            core.info("2222");
        } else {
            core.info("master브랜치 push이벤트 이외에는 동작하지 않음.")
        }
        core.info("3333");
    }
    catch (err) {
        core.info("######");
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
        core.info(`#${pull_number}(master -> ${targetBranch}) 풀리퀘가 이미 존재해 업데이트합니다.`);
        // 풀리퀘 label이 '자동머지'인 경우에만 푸시가 되고 머지가 된다.
        const labels = data.labels.map(labelMap);
        core.info(`labels => ${JSON.stringify(labels)}`)
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
        core.info(`자동머지 풀리퀘(#${pull_number})가 생성되었습니다.`);
        core.debug(JSON.stringify(creationData));
        const labelsResponse = await client.issues.addLabels({
            issue_number: pull_number,
            labels: [label],
            owner,
            repo,
        });
        core.info(`#${pull_number} 풀리퀘에 '${label}' 라벨이 추가되었습니다.`);
        core.debug(JSON.stringify(labelsResponse.data));
    }
    if (github.context.eventName === "push") {
        await merge(pull_number);
        core.info("111111");
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
        core.info("555");
        core.error(err.message);
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
