with open("FYP Again/frontend/static/scripts.js", "r") as f:
    content = f.read()

content = content.replace("countdownText = `in ${daysLeft}d`;", "countdownText = `Administer in ${daysLeft}d`;")

with open("FYP Again/frontend/static/scripts.js", "w") as f:
    f.write(content)
