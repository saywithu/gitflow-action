const core = require("@actions/core"),
    github = require("@actions/github");

const token = core.getInput("github-token", { required: true }),
    label = getInput("label", "자동머지"),
    auto_merge_branches = getInput("auto-merge-branches", ""),
    context = github.context,
    owner = context.repo.owner,
    repo = context.repo.repo,
    client = new github.GitHub(token);

const slack = require('./lib/SlackSend.js');

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
        await slack.postMessage();
        if(!auto_merge_branches) {
            core.info(`자동머지 브랜치가 지정되지 않아 패스합니다.`)
            return;
        }
        const branchList = await getBranchList();
        core.info(`branchList => ${JSON.stringify(branchList)}`)
        if(github.context.eventName === "push") {
            const branches = auto_merge_branches.split(",").map(e => e.trim());
            for (const branch of branches) {
                if(!branch) break;
                const targetBranch = getBranch(branch);
                core.info(`target branch = ${targetBranch}`);
                if(branchList.includes(targetBranch)){
                    await push(targetBranch);
                } else {
                    core.error(`${targetBranch} 브랜치가 존재하지 않습니다.`)
                }
            }
        } else {
            core.info("master브랜치 push이벤트 이외에는 동작하지 않음.")
        }
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
            core.info(`풀리퀘가 '${label}' 라벨이 적용되어 있지않아 자동머지를 패스합니다.`);
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
    }
    else {
        core.info("master브랜치 push이벤트 이외에는 동작하지 않음.");
    }
}

async function merge(pull_number) {
    try {
        const mergeResponse = await client.pulls.merge({
            owner,
            pull_number,
            repo,
        });
        core.info(`#${pull_number} 풀리퀘가 머지되었습니다.`);
        core.debug(JSON.stringify(mergeResponse.data));
    }
    catch (err) {
        // TODO: send slack
        core.setFailed("Merge failed.");
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
