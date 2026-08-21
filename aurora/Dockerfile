# Aurora forecast pipeline — a light CPU job that builds initial conditions,
# calls the deployed Aurora (Foundry) GPU endpoint, tracks cyclones, and publishes
# weather-events.json. Runs on a schedule as an Azure Container Apps Job.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# libgomp1 is required by PyTorch; the eccodes/cfgrib wheels bundle their native libs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the CPU build of PyTorch first (the model runs on the endpoint's GPU, not
# here) so the image stays small, then the rest of the pipeline's dependencies.
COPY requirements.txt ./
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.2" \
    && pip install -r requirements.txt

COPY aurora_pipeline ./aurora_pipeline

# The pipeline is a batch job: run one forecast cycle and exit.
ENTRYPOINT ["python", "-m", "aurora_pipeline.run"]
