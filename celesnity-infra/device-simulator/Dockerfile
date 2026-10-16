FROM python:3.13-alpine

WORKDIR /simulator
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY simulator.py ./

ENTRYPOINT ["python", "/simulator/simulator.py"]
